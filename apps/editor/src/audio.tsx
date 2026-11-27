import { useEffect, useRef, useState } from "react";
import { AudioLines, Play, Plus, Square, Trash2, Upload } from "lucide-react";
import {
  createMixer,
  MASTER_BUS,
  newId,
  type Mixer,
  type Sound,
} from "@mosaic/model";
import { AudioMixer } from "@mosaic/runtime";
import { Field, TextField } from "./controls";
import { importSound, interrupted } from "./files";
import { useEditor } from "./state";

const defaults = createMixer();
const report = (message: string) =>
  useEditor.getState().report(message, "error");

function Gain({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: (value: number) => void;
}) {
  return (
    <div className="audio-gain">
      <input
        aria-label={label}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => change(event.target.valueAsNumber)}
      />
      <output>{Math.round(value * 100)}%</output>
    </div>
  );
}

export function AudioWorkspace({ soundId }: { soundId?: string } = {}) {
  const projectId = useEditor((state) => state.project.id);
  return <MixerEditor key={projectId} soundId={soundId} />;
}

function MixerEditor({ soundId }: { soundId?: string }) {
  const mixer = useEditor((state) => state.project.mixer) ?? defaults;
  const [selected, setSelected] = useState(soundId ?? "");
  const [importing, setImporting] = useState(false);
  const [level, setLevel] = useState(0);
  const preview = useRef<AudioMixer | null>(null);
  const sound = soundId
    ? mixer.sounds.find(({ id }) => id === soundId)
    : (mixer.sounds.find(({ id }) => id === selected) ?? mixer.sounds[0]);

  useEffect(() => {
    const player = new AudioMixer(report);
    preview.current = player;
    const timer = window.setInterval(() => setLevel(player.peak()), 83);
    return () => {
      window.clearInterval(timer);
      player.dispose();
    };
  }, []);
  useEffect(() => {
    preview.current?.configure(mixer);
  }, [mixer]);

  const edit = (recipe: (draft: Mixer) => void) =>
    useEditor.getState().edit((project) => {
      recipe((project.mixer ??= createMixer()));
    });
  const change = (recipe: (draft: Sound) => void) =>
    edit((draft) => {
      const target = draft.sounds.find(({ id }) => id === sound?.id);
      if (target) recipe(target);
    });
  async function load() {
    setImporting(true);
    try {
      const id = await importSound();
      if (id) setSelected(id);
    } catch (failure) {
      if (!interrupted(failure))
        report(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setImporting(false);
    }
  }
  async function audition() {
    const player = preview.current;
    if (player && sound && (await player.unlock())) {
      player.stopAll();
      player.dispatch({ soundId: sound.id, playing: true }, true);
    }
  }
  return (
    <div className={soundId ? "workspace sound-document" : "workspace"}>
      <div className="workspace-bar">
        <AudioLines size={17} />
        <strong>{soundId ? sound?.name : "Audio Mixer"}</strong>
        <button
          className="push"
          disabled={importing || mixer.sounds.length >= 128}
          onClick={() => void load()}
        >
          <Upload size={15} /> Import WAV
        </button>
      </div>
      <div className="system-body effect-workspace">
        <div className="effect-subtitle">
          <strong>Mixer Buses</strong>
          <button
            disabled={mixer.buses.length >= 16}
            onClick={() =>
              edit((draft) => {
                draft.buses.push({
                  id: newId(),
                  name: `Bus ${draft.buses.length + 1}`,
                  gain: 1,
                  muted: false,
                });
              })
            }
          >
            <Plus size={14} /> Bus
          </button>
        </div>
        <div className="mixer-buses">
          <section className="effect-card effect-stack" aria-label="Master bus">
            <div className="effect-subtitle">
              <strong>Master</strong>
              <label className="effect-row">
                <input
                  type="checkbox"
                  aria-label="Mute master"
                  checked={mixer.muted}
                  onChange={(event) =>
                    edit((draft) => {
                      draft.muted = event.target.checked;
                    })
                  }
                />{" "}
                Mute
              </label>
            </div>
            <Gain
              label="Master gain"
              value={mixer.master}
              change={(value) =>
                edit((draft) => {
                  draft.master = value;
                })
              }
            />
            <meter
              className="audio-meter"
              aria-label="Preview output peak"
              min={0}
              max={1}
              value={level}
            />
          </section>
          {mixer.buses.map((bus) => (
            <section
              className="effect-card effect-stack"
              key={bus.id}
              aria-label={bus.name + " bus"}
            >
              <div className="effect-row">
                <TextField
                  label="Bus name"
                  value={bus.name}
                  onChange={(name) =>
                    edit((draft) => {
                      draft.buses.find(({ id }) => id === bus.id)!.name = name;
                    })
                  }
                />
                <button
                  aria-label={"Delete " + bus.name}
                  title="Delete bus and reroute its sounds to Master"
                  onClick={() =>
                    edit((draft) => {
                      draft.buses = draft.buses.filter(
                        ({ id }) => id !== bus.id,
                      );
                      for (const sound of draft.sounds)
                        if (sound.bus === bus.id) sound.bus = MASTER_BUS;
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <Gain
                label={bus.name + " gain"}
                value={bus.gain}
                change={(value) =>
                  edit((draft) => {
                    draft.buses.find(({ id }) => id === bus.id)!.gain = value;
                  })
                }
              />
              <label className="effect-row">
                <input
                  type="checkbox"
                  aria-label={"Mute " + bus.name}
                  checked={bus.muted}
                  onChange={(event) =>
                    edit((draft) => {
                      draft.buses.find(({ id }) => id === bus.id)!.muted =
                        event.target.checked;
                    })
                  }
                />{" "}
                Mute
              </label>
            </section>
          ))}
        </div>
        <div className="effect-subtitle">
          <strong>Sounds</strong>
        </div>
        {!sound ? (
          <p className="subtle-copy">
            Import a 16-bit PCM WAV to audition it or play it from a Blueprint.
          </p>
        ) : (
          <div className="effect-grid sound-grid">
            <div className="effect-stack" aria-label="Sound library">
              {(soundId ? [sound] : mixer.sounds).map((item) => (
                <button
                  className="sound-row"
                  key={item.id}
                  aria-pressed={item.id === sound.id}
                  onClick={() => {
                    preview.current?.stopAll();
                    setSelected(item.id);
                  }}
                >
                  <AudioLines size={15} /> {item.name}
                </button>
              ))}
            </div>
            <section
              className="effect-card effect-stack"
              aria-label="Sound properties"
            >
              <Field label="Name">
                <TextField
                  label="Sound name"
                  value={sound.name}
                  onChange={(name) =>
                    change((draft) => {
                      draft.name = name;
                    })
                  }
                />
              </Field>
              <Field label="Output bus">
                <select
                  aria-label="Sound output bus"
                  value={sound.bus}
                  onChange={(event) =>
                    change((draft) => {
                      draft.bus = event.target.value;
                    })
                  }
                >
                  <option value={MASTER_BUS}>Master</option>
                  {mixer.buses.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Gain">
                <Gain
                  label="Sound gain"
                  value={sound.gain}
                  change={(value) =>
                    change((draft) => {
                      draft.gain = value;
                    })
                  }
                />
              </Field>
              <Field label="Loop in game">
                <input
                  type="checkbox"
                  aria-label="Loop in game"
                  checked={sound.loop}
                  onChange={(event) =>
                    change((draft) => {
                      draft.loop = event.target.checked;
                    })
                  }
                />
              </Field>
              <div className="effect-row">
                <button onClick={() => void audition()}>
                  <Play size={14} /> Audition
                </button>
                <button onClick={() => preview.current?.stopAll()}>
                  <Square size={14} /> Stop audition
                </button>
                <button
                  className="push danger"
                  aria-label="Delete sound"
                  onClick={() =>
                    useEditor.getState().edit((project) => {
                      if (!project.mixer) return;
                      project.mixer.sounds = project.mixer.sounds.filter(
                        ({ id }) => id !== sound.id,
                      );
                      for (const group of [
                        ...project.scenes,
                        ...(project.prefabs ?? []),
                      ])
                        for (const entity of group.entities)
                          if (entity.audio?.soundId === sound.id)
                            delete entity.audio;
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
