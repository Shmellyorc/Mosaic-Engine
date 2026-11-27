import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import {
  easingSchema,
  motionPropertySchema,
  type MotionProperty,
} from "@mosaic/blueprints";
import {
  newId,
  type Entity,
  type Timeline,
  type TimelineTrack,
} from "@mosaic/model";
import { Game } from "@mosaic/runtime";
import { Field, NumberField, TextField } from "./controls";
import { editScene, selectedEntity, selectedScene, useEditor } from "./state";
import { RenderSurface } from "./viewport";

const labels: Record<MotionProperty, string> = {
  x: "Position X",
  y: "Position Y",
  rotation: "Rotation",
  alpha: "Opacity",
  scaleX: "Scale X",
  scaleY: "Scale Y",
};
const available = (timeline: Timeline, entityId: string, current?: string) =>
  motionPropertySchema.options.filter(
    (property) =>
      !timeline.tracks.some(
        (track) =>
          track.id !== current &&
          track.entityId === entityId &&
          track.property === property,
      ),
  );
const quantize = (seconds: number) => Math.round(seconds * 1000) / 1000;

export function TimelineWorkspace() {
  const scene = useEditor(selectedScene);
  const selected = useEditor(selectedEntity);
  const [timelineId, setTimelineId] = useState("");
  const timelines = scene.timelines ?? [];
  const timeline =
    timelines.find(({ id }) => id === timelineId) ?? timelines[0];
  function add() {
    const id = newId();
    editScene((draft) => {
      (draft.timelines ??= []).push({
        id,
        name: `Timeline ${timelines.length + 1}`,
        duration: 2,
        loop: false,
        autoplay: false,
        tracks: [],
      });
    });
    setTimelineId(id);
  }
  return (
    <div className="workspace">
      <div className="workspace-bar">
        <Clock3 size={17} />
        <strong>Timeline · {scene.name}</strong>
        <button
          className="push"
          onClick={add}
          disabled={timelines.length >= 64}
        >
          <Plus size={15} /> Timeline
        </button>
      </div>
      {timeline ? (
        <>
          <div className="clip-tabs effect-tabs">
            {timelines.map((item) => (
              <button
                key={item.id}
                aria-pressed={item.id === timeline.id}
                onClick={() => setTimelineId(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <TimelineEditor
            key={timeline.id}
            timeline={timeline}
            selected={selected}
          />
        </>
      ) : (
        <div className="empty-state">
          <Clock3 size={27} />
          <h2>Scene Timelines</h2>
          <p>Add a timeline to animate entity properties with keyframes.</p>
        </div>
      )}
    </div>
  );
}

function TimelineEditor({
  timeline,
  selected,
}: {
  timeline: Timeline;
  selected?: Entity | null;
}) {
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const game = useMemo(() => new Game(project, scene.id), [project, scene.id]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clock = useRef(0);
  function seek(time: number) {
    clock.current = time;
    setTime(time);
  }
  const seconds = Math.min(time, timeline.duration);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = clock.current + delta;
      if (!timeline.loop && next >= timeline.duration) {
        seek(timeline.duration);
        setPlaying(false);
        return;
      }
      seek(next % timeline.duration);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, timeline.duration, timeline.loop]);

  const change = (recipe: (draft: Timeline) => void) =>
    editScene((draft) => {
      const item = draft.timelines?.find(({ id }) => id === timeline.id);
      if (item) recipe(item);
    });
  const candidate =
    selected && available(timeline, selected.id).length
      ? selected
      : scene.entities.find(({ id }) => available(timeline, id).length);
  const minDuration = Math.max(
    0.1,
    ...timeline.tracks.map((track) => track.keys.at(-1)!.time),
  );
  return (
    <div className="system-body effect-workspace">
      <div className="effect-grid">
        <div className="effect-preview-card timeline-preview">
          <RenderSurface
            label="Timeline scene preview"
            assets={project.assets}
            getFrame={() => {
              game.seekTimeline(timeline.id, seconds);
              return game.frame();
            }}
          />
        </div>
        <div className="effect-card effect-stack">
          <Field label="Name">
            <TextField
              label="Timeline name"
              value={timeline.name}
              onChange={(name) =>
                change((draft) => {
                  draft.name = name;
                })
              }
            />
          </Field>
          <Field label="Duration (s)">
            <NumberField
              label="Timeline duration"
              value={timeline.duration}
              min={minDuration}
              max={600}
              step={0.001}
              onChange={(duration) =>
                change((draft) => {
                  draft.duration = duration;
                })
              }
            />
          </Field>
          <Field label="Loop">
            <input
              aria-label="Loop timeline"
              type="checkbox"
              checked={timeline.loop}
              onChange={(event) =>
                change((draft) => {
                  draft.loop = event.target.checked;
                })
              }
            />
          </Field>
          <Field label="Play on scene start">
            <input
              aria-label="Autoplay timeline"
              type="checkbox"
              checked={timeline.autoplay}
              onChange={(event) =>
                change((draft) => {
                  draft.autoplay = event.target.checked;
                })
              }
            />
          </Field>
          <button
            className="danger"
            onClick={() =>
              editScene((scene) => {
                scene.timelines = scene.timelines?.filter(
                  ({ id }) => id !== timeline.id,
                );
              })
            }
          >
            <Trash2 size={14} /> Delete timeline
          </button>
        </div>
      </div>
      <div className="effect-card effect-stack timeline-controls">
        <div className="effect-row">
          <button
            aria-label={
              playing ? "Pause timeline preview" : "Play timeline preview"
            }
            onClick={() => {
              if (!playing && seconds >= timeline.duration) seek(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            aria-label="Stop timeline preview"
            onClick={() => {
              setPlaying(false);
              seek(0);
            }}
          >
            <Square size={14} />
          </button>
          <output>
            {seconds.toFixed(2)} / {timeline.duration.toFixed(2)} s
          </output>
          <button
            className="push"
            disabled={!candidate || timeline.tracks.length >= 128}
            onClick={() => {
              if (!candidate) return;
              const property = available(timeline, candidate.id)[0];
              change((draft) =>
                draft.tracks.push({
                  id: newId(),
                  entityId: candidate.id,
                  property,
                  keys: [
                    {
                      time: 0,
                      value: candidate.transform[property],
                      ease: "linear",
                    },
                  ],
                }),
              );
            }}
          >
            <Plus size={14} /> Track
          </button>
        </div>
        <input
          aria-label="Timeline playhead"
          type="range"
          min={0}
          max={timeline.duration}
          step={0.001}
          value={seconds}
          onChange={(event) => {
            setPlaying(false);
            seek(event.target.valueAsNumber);
          }}
        />
        <div className="timeline-ruler" aria-hidden="true">
          {Array.from({ length: 5 }, (_, tick) => (
            <span key={tick}>
              {+((timeline.duration * tick) / 4).toFixed(2)}s
            </span>
          ))}
        </div>
      </div>
      {timeline.tracks.map((track) => (
        <TrackEditor
          key={track.id}
          timeline={timeline}
          track={track}
          entities={scene.entities}
          seconds={seconds}
          seek={(time) => {
            seek(time);
            setPlaying(false);
          }}
          change={change}
        />
      ))}
    </div>
  );
}

function TrackEditor({
  track,
  timeline,
  entities,
  seconds,
  seek,
  change,
}: {
  track: TimelineTrack;
  timeline: Timeline;
  entities: Entity[];
  seconds: number;
  seek: (seconds: number) => void;
  change: (recipe: (draft: Timeline) => void) => void;
}) {
  const [chosen, setChosen] = useState(0);
  const index = Math.min(chosen, track.keys.length - 1);
  const keyframe = track.keys[index];
  const entity = entities.find(({ id }) => id === track.entityId)!;
  const update = (recipe: (draft: TimelineTrack) => void) =>
    change((draft) => recipe(draft.tracks.find(({ id }) => id === track.id)!));
  const report = (message: string) =>
    useEditor.getState().report(message, "error");
  const recordTime = Math.min(timeline.duration, quantize(seconds));
  const select = (index: number) => {
    setChosen(index);
    seek(track.keys[index].time);
  };
  function record() {
    const time = recordTime;
    const match = track.keys.findIndex(
      (key) => Math.abs(key.time - time) < 0.000001,
    );
    const value = entity.transform[track.property];
    if (match !== -1) {
      update((draft) => {
        draft.keys[match].value = value;
      });
      select(match);
      return;
    }
    if (track.keys.length >= 128) return;
    const index = track.keys.filter((key) => key.time < time).length;
    update((draft) =>
      draft.keys.splice(index, 0, { time, value, ease: "linear" }),
    );
    setChosen(index);
    seek(time);
  }
  const max =
    track.property === "alpha"
      ? 1
      : track.property.startsWith("scale")
        ? 100
        : 1e7;
  return (
    <section
      className="effect-card effect-stack timeline-track"
      aria-label={entity.name + " " + labels[track.property] + " track"}
    >
      <div className="effect-row effect-track-title">
        <select
          aria-label="Track entity"
          value={track.entityId}
          onChange={(event) =>
            update((draft) => {
              const options = available(timeline, event.target.value, track.id);
              draft.entityId = event.target.value;
              if (!options.includes(draft.property))
                draft.property = options[0];
            })
          }
        >
          {entities
            .filter(({ id }) => available(timeline, id, track.id).length)
            .map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
        <select
          aria-label="Track property"
          value={track.property}
          onChange={(event) =>
            update((draft) => {
              draft.property = motionPropertySchema.parse(event.target.value);
            })
          }
        >
          {available(timeline, track.entityId, track.id).map((property) => (
            <option key={property} value={property}>
              {labels[property]}
            </option>
          ))}
        </select>
        <button
          className="push"
          onClick={record}
          title="Record authored property value at playhead"
          disabled={
            track.keys.length >= 128 &&
            !track.keys.some(
              (key) => Math.abs(key.time - recordTime) < 0.000001,
            )
          }
        >
          <Plus size={14} /> Key
        </button>
        <button
          aria-label="Delete track"
          onClick={() =>
            change((draft) => {
              draft.tracks = draft.tracks.filter(({ id }) => id !== track.id);
            })
          }
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="timeline-lane" aria-label="Track keyframes">
        <i style={{ left: `${(seconds / timeline.duration) * 100}%` }} />
        {track.keys.map(({ time }, keyIndex) => (
          <button
            key={time}
            className="timeline-diamond"
            style={{ left: `${(time / timeline.duration) * 100}%` }}
            aria-pressed={index === keyIndex}
            aria-label={`Key at ${time} seconds`}
            title={`${time}s`}
            onClick={() => select(keyIndex)}
          >
            ◆
          </button>
        ))}
      </div>
      <div className="effect-row key-fields">
        <Field label="Time (s)">
          <NumberField
            label="Keyframe time"
            value={keyframe.time}
            min={0}
            max={timeline.duration}
            step={0.001}
            onChange={(time) => {
              if (
                track.keys.some((key, i) => i !== index && key.time === time)
              ) {
                report("This track already has a key at that time.");
                return;
              }
              update((draft) => {
                draft.keys[index].time = time;
                draft.keys.sort((a, b) => a.time - b.time);
              });
              setChosen(
                track.keys.filter((key, i) => i !== index && key.time < time)
                  .length,
              );
              seek(time);
            }}
          />
        </Field>
        <Field label="Value">
          <NumberField
            label="Keyframe value"
            value={keyframe.value}
            min={track.property === "alpha" ? 0 : -max}
            max={max}
            step={0.01}
            onChange={(value) =>
              update((draft) => {
                draft.keys[index].value = value;
              })
            }
          />
        </Field>
        <Field label="Easing">
          <select
            aria-label="Keyframe easing"
            value={keyframe.ease}
            onChange={(event) =>
              update((draft) => {
                draft.keys[index].ease = easingSchema.parse(event.target.value);
              })
            }
          >
            {easingSchema.options.map((ease) => (
              <option key={ease}>{ease}</option>
            ))}
          </select>
        </Field>
        <button
          aria-label="Delete keyframe"
          disabled={track.keys.length <= 1}
          onClick={() => update((draft) => draft.keys.splice(index, 1))}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </section>
  );
}
