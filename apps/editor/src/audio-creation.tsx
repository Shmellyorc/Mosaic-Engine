import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Download,
  Play,
  Plus,
  Shuffle,
  Square,
  Trash2,
} from "lucide-react";
import {
  createPatch,
  MASTER_BUS,
  newId,
  patchPresets,
  trackerEffects,
  trackerSeconds,
  varyPatch,
  waves,
  type AudioCreation,
  type PatchPreset,
  type SoundPatch,
  type TrackerCell,
  type TrackerSong,
} from "@mosaic/model";
import {
  AudioMixer,
  encodePcmWav,
  renderPatch,
  renderSong,
} from "@mosaic/runtime";
import { Field, NumberField, Section, TextField } from "./controls";
import { activeDocument, openDocument, useEditor } from "./state";

function edit(recipe: (library: AudioCreation) => void) {
  useEditor.getState().edit((draft) => {
    recipe((draft.audioCreation ??= { patches: [], songs: [] }));
  });
}
export function newPatch() {
  const patch = createPatch(newId(), "New Sound");
  edit(({ patches }) => {
    if (patches.length < 128) patches.push(patch);
  });
  openDocument({ kind: "synth", id: patch.id });
}
export function newTracker() {
  const id = newId(),
    pattern = newId(),
    track = newId();
  edit((library) => {
    if (library.songs.length >= 48) return;
    if (!library.patches.length)
      library.patches.push(
        createPatch(newId(), "Tracker Instrument", "Circuit Blip"),
      );
    library.songs.push({
      id,
      name: "New Song",
      bus: MASTER_BUS,
      gain: 0.65,
      loop: false,
      tempo: 112,
      rowsPerBeat: 4,
      tracks: [
        {
          id: track,
          name: "Lead",
          instrumentId: library.patches[0].id,
          gain: 1,
          pan: 0,
          muted: false,
        },
      ],
      patterns: [{ id: pattern, name: "Pattern 1", rows: 16, notes: [] }],
      order: [pattern],
    });
  });
  openDocument({ kind: "tracker", id });
}
function report(error: unknown) {
  useEditor
    .getState()
    .report(error instanceof Error ? error.message : String(error), "error");
}
function download(name: string, channels: Float32Array[]) {
  const bytes = encodePcmWav(channels);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/[\\/:*?"<>|]/g, "-") + ".wav";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function level(signal: Float32Array, offset: number, width: number) {
  let low = 0,
    high = 0;
  for (let n = offset; n < offset + width && n < signal.length; n++) {
    low = Math.min(low, signal[n]);
    high = Math.max(high, signal[n]);
  }
  return { low, high };
}
function Waveform({ signal }: { signal: Float32Array }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const { width, height } = context.canvas;
    context.fillStyle = "#141520";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#303344";
    context.beginPath();
    for (let x = 0; x < width; x += width / 12) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    context.strokeStyle = "#ab8cf9";
    context.lineWidth = 1.5;
    context.beginPath();
    const stride = Math.max(1, Math.ceil(signal.length / width));
    for (let x = 0; x < width; x++) {
      const { low, high } = level(signal, x * stride, stride);
      context.moveTo(x, height * (0.5 - low * 0.46));
      context.lineTo(x, height * (0.5 - high * 0.46));
    }
    context.stroke();
  }, [signal]);
  return (
    <canvas
      ref={canvas}
      aria-label="Generated waveform"
      className="sound-waveform"
      width={680}
      height={220}
    />
  );
}
function Transport({
  sound,
  exportWav,
}: {
  sound: SoundPatch | TrackerSong;
  exportWav: () => void;
}) {
  const mixer = useEditor((state) => state.project.mixer);
  const library = useEditor((state) => state.project.audioCreation);
  const player = useRef<AudioMixer | undefined>(undefined);
  useEffect(() => {
    player.current = new AudioMixer(report);
    return () => {
      player.current?.dispose();
      player.current = undefined;
    };
  }, []);
  useEffect(() => player.current?.configure(mixer, library), [mixer, library]);
  return (
    <div className="inline-actions">
      <button
        onClick={() => {
          const audio = player.current;
          if (audio)
            void audio.unlock().then((ready) => {
              if (!ready) return;
              audio.stopAll();
              audio.dispatch({ soundId: sound.id, playing: true }, true);
            });
        }}
      >
        <Play size={14} /> Audition
      </button>
      <button onClick={() => player.current?.stopAll()}>
        <Square size={14} /> Stop audio
      </button>
      <button
        onClick={() => {
          try {
            exportWav();
          } catch (error) {
            report(error);
          }
        }}
      >
        <Download size={14} /> Export WAV
      </button>
    </div>
  );
}
function Routing({
  sound,
  change,
}: {
  sound: SoundPatch | TrackerSong;
  change: (values: { bus?: string; gain?: number; loop?: boolean }) => void;
}) {
  const buses = useEditor((state) => state.project.mixer?.buses);
  return (
    <Section title="Mixer routing">
      <Field label="Bus">
        <select
          aria-label="Output bus"
          value={sound.bus}
          onChange={(event) => change({ bus: event.target.value })}
        >
          <option value={MASTER_BUS}>Master</option>
          {buses?.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Gain">
        <NumberField
          label="Output gain"
          value={sound.gain}
          min={0}
          max={1}
          step={0.01}
          onChange={(gain) => change({ gain })}
        />
      </Field>
      <Field label="Loop">
        <input
          type="checkbox"
          aria-label="Loop audio"
          checked={sound.loop}
          onChange={(event) => change({ loop: event.target.checked })}
        />
      </Field>
    </Section>
  );
}
const envelope = ["attack", "decay", "sustain", "release"] as const;
const parameters: {
  key:
    | "note"
    | "duration"
    | "pulse"
    | "sweep"
    | "vibrato"
    | "cutoff"
    | "echo"
    | "seed";
  name: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "note", name: "MIDI note", min: 12, max: 108, step: 1 },
  { key: "duration", name: "Duration", min: 0.03, max: 8, step: 0.01 },
  { key: "pulse", name: "Pulse width", min: 0.05, max: 0.95, step: 0.01 },
  { key: "sweep", name: "Pitch sweep", min: -36, max: 36, step: 0.1 },
  { key: "vibrato", name: "Vibrato", min: 0, max: 5, step: 0.1 },
  { key: "cutoff", name: "Low-pass cutoff", min: 70, max: 10000, step: 1 },
  { key: "echo", name: "Echo", min: 0, max: 1, step: 0.01 },
  { key: "seed", name: "Noise seed", min: 1, max: 2147483647, step: 1 },
];
export function SoundDesigner() {
  const ref = useEditor(activeDocument);
  const patch = useEditor((state) =>
    state.project.audioCreation?.patches.find(({ id }) => id === ref?.id),
  );
  const wave = useMemo(
    () => (patch ? renderPatch(patch) : new Float32Array()),
    [patch],
  );
  if (!patch) return null;
  const update = (changes: Partial<SoundPatch>) =>
    edit(({ patches }) => {
      Object.assign(
        patches.find(({ id }) => id === patch.id)!,
        changes,
      );
    });
  return (
    <div className="flow-workspace audio-creation">
      <div className="flow-board">
        <div className="flow-toolbar">
          <AudioLines size={17} />
          <strong>Sound Designer</strong>
        </div>
        <div className="flow-scroll">
          <div className="panel-body">
            <TextField
              label="Patch name"
              value={patch.name}
              onChange={(name) => update({ name })}
            />
            <Waveform signal={wave} />
            <Transport
              sound={patch}
              exportWav={() => download(patch.name, [wave])}
            />
            <div className="sound-presets">
              {Object.keys(patchPresets).map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    const start = createPatch(
                      patch.id,
                      patch.name,
                      key as PatchPreset,
                    );
                    update({
                      ...start,
                      bus: patch.bus,
                      gain: patch.gain,
                      loop: patch.loop,
                    });
                  }}
                >
                  {key}
                </button>
              ))}
              <button onClick={() => update(varyPatch(patch))}>
                <Shuffle size={14} /> Variation
              </button>
            </div>
          </div>
        </div>
      </div>
      <aside className="flow-inspector panel-body">
        <Section title="Oscillator">
          <Field label="Wave">
            <select
              aria-label="Waveform"
              value={patch.wave}
              onChange={(event) =>
                update({
                  wave: waves.find((wave) => wave === event.target.value),
                })
              }
            >
              {waves.map((wave) => (
                <option key={wave}>{wave}</option>
              ))}
            </select>
          </Field>
          {parameters.map(({ key, name, min, max, step }) => (
            <Field key={key} label={name}>
              <NumberField
                label={name}
                value={patch[key]}
                min={min}
                max={max}
                step={step}
                onChange={(value) =>
                  update({ [key]: step === 1 ? Math.round(value) : value })
                }
              />
            </Field>
          ))}
        </Section>
        <Section title="Envelope">
          {envelope.map((key) => (
            <Field key={key} label={key}>
              <NumberField
                label={"Envelope " + key}
                value={patch[key]}
                min={0}
                max={key === "sustain" ? 1 : key === "attack" ? 2 : 4}
                step={0.01}
                onChange={(value) => update({ [key]: value })}
              />
            </Field>
          ))}
        </Section>
        <Routing sound={patch} change={update} />
      </aside>
    </div>
  );
}

const noteNames = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
const noteName = (note: number) =>
  noteNames[note % 12] + (Math.floor(note / 12) - 1);
const keyboard = "zsxdcvgbhnjm";
export function MusicTracker() {
  const ref = useEditor(activeDocument);
  const library = useEditor((state) => state.project.audioCreation);
  const song = library?.songs.find(({ id }) => id === ref?.id);
  const [patternId, setPatternId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [row, setRow] = useState(0);
  const [octave, setOctave] = useState(4);
  if (!song || !library) return null;
  const pattern =
    song.patterns.find(({ id }) => id === patternId) ?? song.patterns[0];
  const track = song.tracks.find(({ id }) => id === trackId) ?? song.tracks[0];
  const currentRow = Math.min(pattern.rows - 1, row);
  const cells = new Map(
    pattern.notes.map(({ track, row, cell }) => [
      JSON.stringify([track, row]),
      cell,
    ]),
  );
  const current = cells.get(JSON.stringify([track.id, currentRow]));
  const revise = (recipe: (song: TrackerSong) => void) =>
    edit(({ songs }) => {
      const target = songs.find(({ id }) => id === song.id);
      if (target) recipe(target);
    });
  const setSong = (chunk: Partial<TrackerSong>) =>
    revise((draft) => {
      Object.assign(draft, chunk);
    });
  function editCell(
    trackId: string,
    row: number,
    revision?: Partial<TrackerCell>,
  ) {
    revise((draft) => {
      const target = draft.patterns.find(({ id }) => id === pattern.id)!;
      const index = target.notes.findIndex(
        (item) => item.track === trackId && item.row === row,
      );
      if (!revision) {
        if (index >= 0) target.notes.splice(index, 1);
        return;
      }
      if (index >= 0) Object.assign(target.notes[index].cell, revision);
      else
        target.notes.push({
          track: trackId,
          row,
          cell: {
            note: 60,
            velocity: 0.8,
            effect: "none",
            amount: 0.4,
            ...revision,
          },
        });
    });
  }
  function addPattern(copy: boolean) {
    const id = newId();
    if (song?.patterns.length === 48) return;
    revise((draft) => {
      draft.patterns.push({
        id,
        name: "Pattern " + (draft.patterns.length + 1),
        rows: pattern.rows,
        notes: copy ? structuredClone(pattern.notes) : [],
      });
    });
    setPatternId(id);
  }
  return (
    <div className="flow-workspace tracker-workspace">
      <div className="flow-board">
        <div className="flow-toolbar">
          <AudioLines size={17} />
          <strong>Music Tracker</strong>
          <span>{trackerSeconds(song).toFixed(2)} s</span>
        </div>
        <div className="flow-scroll">
          <div className="panel-body">
            <TextField
              label="Song name"
              value={song.name}
              onChange={(name) => setSong({ name })}
            />
            <Transport
              sound={song}
              exportWav={() =>
                download(song.name, renderSong(song, library.patches))
              }
            />
            <div className="tracker-controls">
              <select
                aria-label="Pattern"
                value={pattern.id}
                onChange={(event) => setPatternId(event.target.value)}
              >
                {song.patterns.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <button onClick={() => addPattern(false)}>
                <Plus size={14} /> Pattern
              </button>
              <button onClick={() => addPattern(true)}>
                Duplicate pattern
              </button>
              <button
                disabled={song.tracks.length >= 16}
                onClick={() => {
                  const id = newId();
                  revise((draft) => {
                    draft.tracks.push({
                      id,
                      name: "Track " + (draft.tracks.length + 1),
                      instrumentId: library.patches[0].id,
                      gain: 1,
                      pan: 0,
                      muted: false,
                    });
                  });
                  setTrackId(id);
                }}
              >
                <Plus size={14} /> Track
              </button>
            </div>
            <div className="tracker-grid">
              <table aria-label="Pattern notes">
                <thead>
                  <tr>
                    <th>Row</th>
                    {song.tracks.map((item) => (
                      <th key={item.id}>
                        <button
                          aria-pressed={item.id === track.id}
                          onClick={() => setTrackId(item.id)}
                        >
                          {item.name}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: pattern.rows }, (_, n) => (
                    <tr key={n} data-beat={n % song.rowsPerBeat === 0}>
                      <th>{String(n + 1).padStart(2, "0")}</th>
                      {song.tracks.map((item, column) => {
                        const cell = cells.get(JSON.stringify([item.id, n]));
                        return (
                          <td key={item.id}>
                            <button
                              data-row={n}
                              data-column={column}
                              aria-label={item.name + " row " + (n + 1)}
                              aria-pressed={
                                track.id === item.id && currentRow === n
                              }
                              onFocus={() => {
                                setTrackId(item.id);
                                setRow(n);
                              }}
                              onClick={() => {
                                if (!cell)
                                  editCell(item.id, n, {
                                    note: (octave + 1) * 12,
                                  });
                              }}
                              onKeyDown={(event) => {
                                const key = event.key.toLowerCase();
                                const note = keyboard.indexOf(key);
                                if (key === "delete" || key === "backspace") {
                                  event.preventDefault();
                                  editCell(item.id, n);
                                  return;
                                }
                                if (key.length === 1 && note >= 0) {
                                  event.preventDefault();
                                  editCell(item.id, n, {
                                    note: (octave + 1) * 12 + note,
                                  });
                                  return;
                                }
                                const delta = {
                                  arrowup: [-1, 0],
                                  arrowdown: [1, 0],
                                  arrowleft: [0, -1],
                                  arrowright: [0, 1],
                                }[key];
                                if (delta) {
                                  event.preventDefault();
                                  event.currentTarget
                                    .closest("table")
                                    ?.querySelector<HTMLButtonElement>(
                                      `[data-row="${n + delta[0]}"][data-column="${column + delta[1]}"]`,
                                    )
                                    ?.focus();
                                }
                              }}
                            >
                              {cell
                                ? noteName(cell.note) +
                                  (cell.effect === "none"
                                    ? ""
                                    : " · " + cell.effect)
                                : "···"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small className="muted">
              Enter notes with Z through M. Use arrows to move and Delete to
              clear.
            </small>
          </div>
        </div>
      </div>
      <aside className="flow-inspector panel-body">
        <Section title="Timing">
          <Field label="BPM">
            <NumberField
              label="Song tempo"
              value={song.tempo}
              min={40}
              max={240}
              onChange={(tempo) => setSong({ tempo: Math.round(tempo) })}
            />
          </Field>
          <Field label="Rows per beat">
            <NumberField
              label="Rows per beat"
              value={song.rowsPerBeat}
              min={1}
              max={8}
              onChange={(rowsPerBeat) =>
                setSong({ rowsPerBeat: Math.round(rowsPerBeat) })
              }
            />
          </Field>
          <Field label="Input octave">
            <NumberField
              label="Input octave"
              value={octave}
              min={1}
              max={7}
              onChange={(value) => setOctave(Math.round(value))}
            />
          </Field>
        </Section>
        <Section title="Pattern">
          <TextField
            label="Pattern name"
            value={pattern.name}
            onChange={(name) =>
              revise((draft) => {
                draft.patterns.find(({ id }) => id === pattern.id)!.name = name;
              })
            }
          />
          <Field label="Rows">
            <NumberField
              label="Pattern rows"
              value={pattern.rows}
              min={1}
              max={64}
              onChange={(value) =>
                revise((draft) => {
                  const active = draft.patterns.find(
                    ({ id }) => id === pattern.id,
                  )!;
                  active.rows = Math.round(value);
                  active.notes = active.notes.filter(
                    ({ row }) => row < active.rows,
                  );
                })
              }
            />
          </Field>
        </Section>
        <Section title="Track">
          <TextField
            label="Track name"
            value={track.name}
            onChange={(name) =>
              revise((draft) => {
                draft.tracks.find(({ id }) => id === track.id)!.name = name;
              })
            }
          />
          <Field label="Instrument">
            <select
              aria-label="Track instrument"
              value={track.instrumentId}
              onChange={(event) =>
                revise((draft) => {
                  draft.tracks.find(({ id }) => id === track.id)!.instrumentId =
                    event.target.value;
                })
              }
            >
              {library.patches.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          {(["gain", "pan"] as const).map((key) => (
            <Field key={key} label={key}>
              <NumberField
                label={"Track " + key}
                value={track[key]}
                min={key === "pan" ? -1 : 0}
                max={1}
                step={0.01}
                onChange={(value) =>
                  revise((draft) => {
                    draft.tracks.find(({ id }) => id === track.id)![key] =
                      value;
                  })
                }
              />
            </Field>
          ))}
          <Field label="Muted">
            <input
              type="checkbox"
              aria-label="Mute track"
              checked={track.muted}
              onChange={(event) =>
                revise((draft) => {
                  draft.tracks.find(({ id }) => id === track.id)!.muted =
                    event.target.checked;
                })
              }
            />
          </Field>
        </Section>
        <Section title={"Note · " + track.name + " / " + (currentRow + 1)}>
          <Field label="MIDI note">
            <NumberField
              label="Tracker MIDI note"
              value={current?.note ?? 60}
              min={12}
              max={108}
              onChange={(note) =>
                editCell(track.id, currentRow, { note: Math.round(note) })
              }
            />
          </Field>
          <Field label="Effect">
            <select
              aria-label="Note effect"
              value={current?.effect ?? "none"}
              onChange={(event) =>
                editCell(track.id, currentRow, {
                  effect: trackerEffects.find(
                    (effect) => effect === event.target.value,
                  ),
                })
              }
            >
              {trackerEffects.map((effect) => (
                <option key={effect}>{effect}</option>
              ))}
            </select>
          </Field>
          {(["velocity", "amount"] as const).map((key) => (
            <Field key={key} label={key}>
              <NumberField
                label={"Note " + key}
                value={current?.[key] ?? (key === "velocity" ? 0.8 : 0.4)}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) =>
                  editCell(track.id, currentRow, { [key]: value })
                }
              />
            </Field>
          ))}
          <button
            disabled={!current}
            onClick={() => editCell(track.id, currentRow)}
          >
            Clear note
          </button>
        </Section>
        <Section title="Arrangement">
          {song.order.map((id, index) => (
            <div className="tracker-order" key={index}>
              <button onClick={() => setPatternId(id)}>
                {song.patterns.find((pattern) => pattern.id === id)?.name}
              </button>
              <button
                aria-label={"Move pattern " + (index + 1) + " earlier"}
                disabled={index === 0}
                onClick={() =>
                  revise(({ order }) => {
                    [order[index - 1], order[index]] = [
                      order[index],
                      order[index - 1],
                    ];
                  })
                }
              >
                ↑
              </button>
              <button
                aria-label={"Remove arrangement item " + (index + 1)}
                disabled={song.order.length === 1}
                onClick={() =>
                  revise(({ order }) => {
                    order.splice(index, 1);
                  })
                }
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            disabled={song.order.length >= 96}
            onClick={() =>
              revise((draft) => {
                draft.order.push(pattern.id);
              })
            }
          >
            Append pattern
          </button>
        </Section>
        <Routing sound={song} change={setSong} />
      </aside>
    </div>
  );
}
