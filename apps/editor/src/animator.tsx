import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Flag,
  GitBranch,
  Pause,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { newId, type Animator, type Entity, type Frame } from "@mosaic/model";
import { AnimationPlayer } from "@mosaic/runtime";
import { Field, NumberField, TextField } from "./controls";
import { editEntity } from "./state";

export function FrameImage({
  frame,
  source,
}: {
  frame: Frame;
  source: string;
}) {
  const scale = Math.min(3, 180 / Math.max(frame.w, frame.h));
  return (
    <div
      role="img"
      aria-label="Current spritesheet frame"
      style={{
        width: frame.w * scale,
        height: frame.h * scale,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <img
        src={source}
        alt=""
        style={{
          position: "absolute",
          maxWidth: "none",
          imageRendering: "pixelated",
          transformOrigin: "top left",
          transform: `translate(${-frame.x * scale}px,${-frame.y * scale}px) scale(${scale})`,
        }}
      />
    </div>
  );
}

export function deleteAnimationClip(entity: Entity, clipId: string) {
  entity.clips = entity.clips.filter((clip) => clip.id !== clipId);
  const machine = entity.animator;
  if (!machine) return;
  machine.states = machine.states.filter((state) => state.clipId !== clipId);
  retainTransitions(machine);
  if (!machine.states.length) delete entity.animator;
}

function retainTransitions(machine: Animator) {
  const ids = new Set(machine.states.map(({ id }) => id));
  machine.transitions = machine.transitions.filter(
    ({ from, to }) => (from === null || ids.has(from)) && ids.has(to),
  );
  if (!ids.has(machine.entry) && machine.states[0])
    machine.entry = machine.states[0].id;
}

const comparisons = {
  lt: "Less than",
  eq: "Equals",
  gt: "Greater than",
  ne: "Not equal",
} as const;
function defaultCondition(
  parameterId?: string,
): Animator["transitions"][number]["condition"] {
  return parameterId
    ? { kind: "parameter", parameterId, op: "gt", value: 0 }
    : { kind: "finished" };
}

function MachinePreview({
  definition,
  entity,
  source,
}: {
  definition: Animator;
  entity: Entity;
  source: string;
}) {
  const player = useRef<{
    simulation: AnimationPlayer;
    definition: Animator;
    clips: Entity["clips"];
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState<{
    frame?: Frame;
    state?: string;
    definition?: Animator;
  }>({});
  const [values, setValues] = useState<Partial<Record<string, number>>>({});
  useEffect(() => {
    if (!playing) return;
    if (
      player.current?.definition !== definition ||
      player.current?.clips !== entity.clips
    )
      player.current = {
        simulation: new AnimationPlayer(definition, entity.clips),
        definition,
        clips: entity.clips,
      };
    const { simulation } = player.current;
    let last = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      simulation.step(delta);
      const frame = simulation.frame();
      const state = simulation.stateId;
      setPreview((previous) =>
        previous.frame === frame &&
        previous.state === state &&
        previous.definition === definition
          ? previous
          : { frame, state, definition },
      );
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, definition, entity.clips]);
  const initial = definition.states.find(
    (state) => state.id === definition.entry,
  )!;
  const active = preview.definition === definition ? preview.state : undefined;
  const displayed =
    (preview.definition === definition ? preview.frame : undefined) ??
    entity.clips.find((clip) => clip.id === initial.clipId)?.frames[0];
  return (
    <section className="effect-preview-card" aria-label="State machine preview">
      <div className="effect-subtitle">
        <strong>
          {definition.states.find((state) => state.id === active)?.name ??
            initial.name}
        </strong>
        <button onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause Preview" : "Play Preview"}
        </button>
      </div>
      <div className="animation-preview">
        {displayed && <FrameImage frame={displayed} source={source} />}
      </div>
      {playing &&
        definition.parameters.map((parameter) => (
          <Field label={parameter.name} key={parameter.id}>
            <NumberField
              label={parameter.name + " preview value"}
              value={
                (active ? values[parameter.id] : undefined) ?? parameter.value
              }
              step={0.1}
              onChange={(value) => {
                player.current?.simulation.parameter(parameter.id, value);
                setValues((previous) => ({
                  ...previous,
                  [parameter.id]: value,
                }));
              }}
            />
          </Field>
        ))}
    </section>
  );
}

export function AnimatorMachine({
  entity,
  source,
}: {
  entity: Entity;
  source: string;
}) {
  const machine = entity.animator;
  const change = (recipe: (draft: Animator) => void) =>
    editEntity((entity) => {
      if (entity.animator) recipe(entity.animator);
    });
  const addState = () => {
    const clip = entity.clips[0];
    if (!clip) return;
    const state = {
      id: newId(),
      name: machine ? `State ${machine.states.length + 1}` : clip.name,
      clipId: clip.id,
    };
    editEntity((draft) => {
      if (draft.animator) draft.animator.states.push(state);
      else
        draft.animator = {
          entry: state.id,
          states: [state],
          parameters: [],
          transitions: [],
        };
    });
  };
  if (!machine)
    return (
      <div className="empty-state">
        <GitBranch size={27} />
        <h2>Animation State Machine</h2>
        <p>
          {entity.clips.length
            ? "Add a state to set the entry animation."
            : "Create a clip before adding states."}
        </p>
        <button onClick={addState} disabled={!entity.clips.length}>
          <Plus size={15} /> State
        </button>
      </div>
    );
  return (
    <div className="system-body effect-workspace">
      <div className="effect-grid">
        <section>
          <div className="effect-subtitle">
            <strong>States</strong>
            <button onClick={addState} disabled={machine.states.length >= 64}>
              <Plus size={14} /> State
            </button>
          </div>
          <div className="effect-stack">
            {machine.states.map((state) => (
              <div
                className={`effect-card ${state.id === machine.entry ? "entry" : ""}`}
                key={state.id}
              >
                <div className="effect-row">
                  <GitBranch size={16} />
                  <TextField
                    label="State name"
                    value={state.name}
                    onChange={(name) =>
                      change((draft) => {
                        draft.states.find(({ id }) => id === state.id)!.name =
                          name;
                      })
                    }
                  />
                  <button
                    aria-label={"Set " + state.name + " as entry"}
                    title="Entry state"
                    aria-pressed={state.id === machine.entry}
                    onClick={() =>
                      change((draft) => {
                        draft.entry = state.id;
                      })
                    }
                  >
                    <Flag size={14} />
                  </button>
                  <button
                    aria-label={"Remove state " + state.name}
                    title="Remove state"
                    onClick={() =>
                      editEntity((draft) => {
                        const definition = draft.animator!;
                        definition.states = definition.states.filter(
                          ({ id }) => id !== state.id,
                        );
                        if (!definition.states.length) delete draft.animator;
                        else retainTransitions(definition);
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <Field label="Clip">
                  <select
                    aria-label={state.name + " clip"}
                    value={state.clipId}
                    onChange={(event) =>
                      change((draft) => {
                        draft.states.find(({ id }) => id === state.id)!.clipId =
                          event.target.value;
                      })
                    }
                  >
                    {entity.clips.map((clip) => (
                      <option key={clip.id} value={clip.id}>
                        {clip.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ))}
          </div>
        </section>
        <MachinePreview definition={machine} entity={entity} source={source} />
      </div>
      <div className="effect-subtitle">
        <strong>Parameters</strong>
        <button
          disabled={machine.parameters.length >= 32}
          onClick={() =>
            change((draft) => {
              draft.parameters.push({
                id: newId(),
                name: `Parameter ${draft.parameters.length + 1}`,
                value: 0,
              });
            })
          }
        >
          <Plus size={14} /> Parameter
        </button>
      </div>
      {machine.parameters.map((parameter) => (
        <div className="effect-row effect-card" key={parameter.id}>
          <TextField
            label="Parameter name"
            value={parameter.name}
            onChange={(name) =>
              change((draft) => {
                draft.parameters.find(({ id }) => id === parameter.id)!.name =
                  name;
              })
            }
          />
          <NumberField
            label="Initial parameter value"
            value={parameter.value}
            step={0.1}
            onChange={(value) =>
              change((draft) => {
                draft.parameters.find(({ id }) => id === parameter.id)!.value =
                  value;
              })
            }
          />
          <button
            aria-label={"Remove parameter " + parameter.name}
            onClick={() =>
              change((draft) => {
                draft.parameters = draft.parameters.filter(
                  ({ id }) => id !== parameter.id,
                );
                draft.transitions = draft.transitions.filter(
                  ({ condition }) =>
                    condition.kind !== "parameter" ||
                    condition.parameterId !== parameter.id,
                );
              })
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="effect-subtitle">
        <strong>Transitions</strong>
        <button
          disabled={
            machine.states.length < 2 || machine.transitions.length >= 128
          }
          onClick={() =>
            change((draft) => {
              draft.transitions.push({
                id: newId(),
                from: draft.states[0].id,
                to: draft.states[1].id,
                condition: defaultCondition(draft.parameters[0]?.id),
              });
            })
          }
        >
          <Plus size={14} /> Transition
        </button>
      </div>
      {machine.transitions.map((transition, index) => {
        const update = (recipe: (draft: typeof transition) => void) =>
          change((draft) =>
            recipe(draft.transitions.find(({ id }) => id === transition.id)!),
          );
        const { condition, from, to } = transition;
        return (
          <section
            className="effect-card effect-stack"
            key={transition.id}
            aria-label={`Transition ${index + 1}`}
          >
            <div className="effect-row">
              <select
                aria-label="Transition source"
                value={from ?? ""}
                onChange={(event) =>
                  update((draft) => {
                    draft.from = event.target.value || null;
                  })
                }
              >
                <option value="">Any state</option>
                {machine.states
                  .filter(({ id }) => id !== to)
                  .map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
              <ArrowRight size={16} />
              <select
                aria-label="Transition destination"
                value={to}
                onChange={(event) =>
                  update((draft) => {
                    draft.to = event.target.value;
                  })
                }
              >
                {machine.states
                  .filter(({ id }) => id !== from)
                  .map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
              <button
                title="Move transition earlier"
                aria-label="Move transition earlier"
                disabled={!index}
                onClick={() =>
                  change((draft) => {
                    [draft.transitions[index - 1], draft.transitions[index]] = [
                      draft.transitions[index],
                      draft.transitions[index - 1],
                    ];
                  })
                }
              >
                ↑
              </button>
              <button
                aria-label="Delete transition"
                onClick={() =>
                  change((draft) => {
                    draft.transitions = draft.transitions.filter(
                      ({ id }) => id !== transition.id,
                    );
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="effect-row">
              <select
                aria-label="Transition condition"
                value={condition.kind}
                onChange={(event) =>
                  update((draft) => {
                    draft.condition = defaultCondition(
                      event.target.value === "parameter"
                        ? machine.parameters[0]?.id
                        : undefined,
                    );
                  })
                }
              >
                <option value="finished">Clip finished</option>
                <option value="parameter" disabled={!machine.parameters.length}>
                  Parameter
                </option>
              </select>
              {condition.kind === "parameter" && (
                <>
                  <select
                    aria-label="Transition parameter"
                    value={condition.parameterId}
                    onChange={(event) =>
                      update((draft) => {
                        if (draft.condition.kind === "parameter")
                          draft.condition.parameterId = event.target.value;
                      })
                    }
                  >
                    {machine.parameters.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Transition comparison"
                    value={condition.op}
                    onChange={(event) =>
                      update((draft) => {
                        if (draft.condition.kind === "parameter")
                          draft.condition.op = event.target
                            .value as keyof typeof comparisons;
                      })
                    }
                  >
                    {Object.entries(comparisons).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <NumberField
                    label="Transition threshold"
                    value={condition.value}
                    step={0.1}
                    onChange={(value) =>
                      update((draft) => {
                        if (draft.condition.kind === "parameter")
                          draft.condition.value = value;
                      })
                    }
                  />
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
