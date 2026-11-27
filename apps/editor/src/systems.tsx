import { useEffect, useState } from "react";
import { Film, Gamepad2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { newId } from "@mosaic/model";
import { AnimatorMachine, deleteAnimationClip, FrameImage } from "./animator";
import { Field, NumberField, TextField } from "./controls";
import { editEntity, selectedEntity, useEditor } from "./state";

export function InputWorkspace() {
  const axes = useEditor((state) => state.project.input);
  const [capture, setCapture] = useState<{
    id: string;
    side: "negative" | "positive";
  } | null>(null);
  function assign(id: string, side: "negative" | "positive", codes: string[]) {
    useEditor.getState().edit((project) => {
      const axis = project.input.find((axis) => axis.id === id);
      if (axis) axis[side] = codes;
    });
  }
  useEffect(() => {
    if (!capture) return;
    const listener = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        event.code !== "Escape" &&
        /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(event.code)
      ) {
        const axis = useEditor
          .getState()
          .project.input.find((item) => item.id === capture.id);
        if (axis)
          assign(
            axis.id,
            capture.side,
            [...new Set([...axis[capture.side], event.code])].slice(0, 16),
          );
      }
      setCapture(null);
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [capture]);
  return (
    <div className="workspace">
      <div className="workspace-bar">
        <Gamepad2 size={17} />
        <strong>Input Actions</strong>
        <button
          className="push"
          onClick={() =>
            useEditor.getState().edit((project) => {
              project.input.push({
                id: newId(),
                name: `Axis ${project.input.length + 1}`,
                negative: [],
                positive: [],
              });
            })
          }
        >
          <Plus size={16} /> Axis
        </button>
      </div>
      <div className="system-body">
        <table className="system-table">
          <thead>
            <tr>
              <th>Axis</th>
              <th>Negative (−1)</th>
              <th>Positive (+1)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {axes.map((axis) => (
              <tr key={axis.id}>
                <td>
                  <TextField
                    label="Input axis name"
                    value={axis.name}
                    onChange={(name) =>
                      useEditor.getState().edit((project) => {
                        project.input.find(
                          (item) => item.id === axis.id,
                        )!.name = name;
                      })
                    }
                  />
                </td>
                {(["negative", "positive"] as const).map((side) => (
                  <td key={side}>
                    <div className="binding-list">
                      {axis[side].map((code) => (
                        <button
                          key={code}
                          title={`Remove ${code}`}
                          onClick={() =>
                            assign(
                              axis.id,
                              side,
                              axis[side].filter((key) => key !== code),
                            )
                          }
                        >
                          {code} ×
                        </button>
                      ))}
                      <button
                        onClick={() => setCapture({ id: axis.id, side })}
                        disabled={axis[side].length >= 16}
                      >
                        {capture?.id === axis.id && capture.side === side
                          ? "Press a key…"
                          : "+ Key"}
                      </button>
                    </div>
                  </td>
                ))}
                <td>
                  <button
                    aria-label={`Remove axis ${axis.name}`}
                    onClick={() =>
                      useEditor.getState().edit((project) => {
                        project.input = project.input.filter(
                          (item) => item.id !== axis.id,
                        );
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!axes.length && (
          <p className="subtle-copy">
            Add an axis to map keys for your blueprints.
          </p>
        )}
      </div>
    </div>
  );
}

export function AnimatorWorkspace() {
  const entity = useEditor(selectedEntity);
  const source = useEditor((state) => {
    if (entity?.visual?.kind !== "sprite") return;
    const visual = entity.visual;
    return state.project.assets.find((asset) => asset.id === visual.assetId)
      ?.source;
  });
  const [tab, setTab] = useState<"clips" | "states">("clips");
  const [clipId, setClipId] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clip =
    entity?.clips.find((item) => item.id === clipId) ?? entity?.clips[0];
  const visibleIndex = Math.min(index, (clip?.frames.length ?? 1) - 1);
  const frame = clip?.frames[visibleIndex];
  useEffect(() => {
    if (!playing || !clip) return;
    const timer = window.setInterval(
      () =>
        setIndex((frame) => {
          if (frame + 1 < clip.frames.length) return frame + 1;
          return clip.loop ? 0 : clip.frames.length - 1;
        }),
      1000 / clip.fps,
    );
    return () => clearInterval(timer);
  }, [playing, clip]);
  function changeClip(recipe: (draft: NonNullable<typeof clip>) => void) {
    editEntity((draft) => {
      const selected = draft.clips.find((item) => item.id === clip?.id);
      if (selected) recipe(selected);
    });
  }
  function add() {
    const id = newId();
    editEntity((draft) => {
      let number = 1;
      while (draft.clips.some((item) => item.name === `Clip ${number}`))
        number++;
      const visual = draft.visual?.kind === "sprite" ? draft.visual : undefined;
      draft.clips.push({
        id,
        name: `Clip ${number}`,
        fps: 8,
        loop: true,
        frames: [visual?.frame ?? { x: 0, y: 0, w: 16, h: 16 }],
      });
    });
    setClipId(id);
    setIndex(0);
  }
  return (
    <div className="workspace">
      <div className="workspace-bar">
        <Film size={17} />
        <strong>{entity ? `${entity.name} / Animator` : "Animator"}</strong>
        {source && (
          <div className="push effect-row effect-tabs">
            <button
              aria-pressed={tab === "clips"}
              onClick={() => setTab("clips")}
            >
              Clips
            </button>
            <button
              aria-pressed={tab === "states"}
              onClick={() => {
                setPlaying(false);
                setTab("states");
              }}
            >
              State Machine
            </button>
            {tab === "clips" && (
              <button
                onClick={add}
                disabled={(entity?.clips.length ?? 0) >= 50}
              >
                <Plus size={15} /> Clip
              </button>
            )}
          </div>
        )}
      </div>
      {!source ? (
        <div className="empty-state">
          <Film size={27} />
          <h2>Spritesheet Animation</h2>
          <p>Select an entity with a sprite to add or edit clips.</p>
        </div>
      ) : tab === "states" && entity ? (
        <AnimatorMachine key={entity.id} entity={entity} source={source} />
      ) : (
        <div className="system-body">
          <div className="clip-tabs">
            {entity?.clips.map((item) => (
              <button
                key={item.id}
                className={clip?.id === item.id ? "selected" : ""}
                onClick={() => {
                  setClipId(item.id);
                  setIndex(0);
                  setPlaying(false);
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
          {clip && frame && (
            <div className="animator-grid">
              <div className="animation-preview">
                <FrameImage frame={frame} source={source} />
                <button
                  aria-label={playing ? "Pause clip" : "Play clip"}
                  onClick={() => {
                    if (!playing && !clip.loop) setIndex(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
              </div>
              <div className="animation-properties">
                <Field label="Clip">
                  <TextField
                    label="Clip name"
                    value={clip.name}
                    onChange={(name) => {
                      if (
                        entity!.clips.some(
                          (item) => item.id !== clip.id && item.name === name,
                        )
                      ) {
                        useEditor
                          .getState()
                          .report(
                            "An animation already uses that clip name.",
                            "error",
                          );
                        return;
                      }
                      changeClip((draft) => {
                        draft.name = name;
                      });
                    }}
                  />
                </Field>
                <Field label="FPS">
                  <NumberField
                    label="Clip FPS"
                    value={clip.fps}
                    min={0.1}
                    max={120}
                    step={0.1}
                    onChange={(fps) =>
                      changeClip((draft) => {
                        draft.fps = fps;
                      })
                    }
                  />
                </Field>
                <Field label="Loop">
                  <input
                    type="checkbox"
                    checked={clip.loop}
                    onChange={(event) =>
                      changeClip((draft) => {
                        draft.loop = event.target.checked;
                      })
                    }
                  />
                </Field>
                <div className="numeric-grid">
                  {(["x", "y", "w", "h"] as const).map((key) => (
                    <Field label={key.toUpperCase()} key={key}>
                      <NumberField
                        label={`Frame ${key}`}
                        value={frame[key]}
                        min={key === "x" || key === "y" ? 0 : 1}
                        max={8192}
                        onChange={(value) =>
                          changeClip((draft) => {
                            draft.frames[visibleIndex][key] = value;
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <button
                  className="danger"
                  onClick={() =>
                    editEntity((draft) => deleteAnimationClip(draft, clip.id))
                  }
                >
                  <Trash2 size={14} /> Delete clip
                </button>
              </div>
              <div className="timeline">
                {clip.frames.map((item, i) => (
                  <button
                    key={i}
                    className={i === visibleIndex ? "selected" : ""}
                    aria-label={`Frame ${i + 1}`}
                    onClick={() => {
                      setIndex(i);
                      setPlaying(false);
                    }}
                  >
                    <span>◆</span>
                    {i + 1}
                    <small>
                      {item.x}, {item.y}
                    </small>
                  </button>
                ))}
                <button
                  onClick={() =>
                    changeClip((draft) => {
                      draft.frames.push({ ...frame });
                    })
                  }
                  disabled={clip.frames.length >= 128}
                >
                  <Plus size={14} /> Frame
                </button>
                <button
                  disabled={clip.frames.length < 2}
                  onClick={() =>
                    changeClip((draft) => {
                      draft.frames.splice(visibleIndex, 1);
                    })
                  }
                >
                  <Trash2 size={14} /> Frame
                </button>
              </div>
            </div>
          )}
          {!clip && (
            <div className="subtle-copy">
              Add a clip and specify its frames in source pixels.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
