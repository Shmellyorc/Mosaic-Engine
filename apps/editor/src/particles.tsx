import { useMemo, useRef, useState } from "react";
import { Pause, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  createEmitter,
  MAX_EMITTERS,
  type ParticleEmitter,
} from "@mosaic/model";
import { Game } from "@mosaic/runtime";
import { Field, NumberField } from "./controls";
import { editEntity, selectedEntity, selectedScene, useEditor } from "./state";
import { RenderSurface } from "./viewport";

const numericFields = [
  ["rate", "Rate / second", 0, 500, 0.1],
  ["burst", "Burst count", 1, 256, 1],
  ["limit", "Live limit", 1, 1024, 1],
  ["lifetime", "Lifetime (s)", 0.05, 20, 0.05],
  ["size", "Start size", 1, 256, 0.1],
  ["endSize", "End size", 0, 256, 0.1],
  ["angle", "Angle", -360, 360, 1],
  ["spread", "Spread", 0, 360, 1],
  ["speed", "Speed", 0, 4000, 1],
  ["gravity", "Gravity", -4000, 4000, 1],
  ["seed", "Seed", 1, 0xffffffff, 1],
] as const;

export function ParticlesWorkspace() {
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const entity = useEditor(selectedEntity);
  const [playing, setPlaying] = useState(true);
  const previous = useRef(0);
  const burst = useRef(false);
  const affected = entity?.id;
  const emitter = entity?.particles;
  const game = useMemo(
    () => (emitter ? new Game(project, scene.id) : null),
    [emitter, project, scene.id],
  );
  const change = (recipe: (draft: ParticleEmitter) => void) =>
    editEntity((draft) => {
      if (draft.particles) recipe(draft.particles);
    });
  return (
    <div className="workspace">
      <div className="workspace-bar">
        <Sparkles size={17} />
        <strong>{entity ? entity.name + " / Particles" : "Particles"}</strong>
        {entity && !emitter && (
          <button
            className="push"
            disabled={
              scene.entities.filter(({ particles }) => particles).length >=
              MAX_EMITTERS
            }
            onClick={() => {
              setPlaying(true);
              editEntity((draft) => {
                draft.particles = createEmitter();
              });
            }}
          >
            <Plus size={15} /> Emitter
          </button>
        )}
      </div>
      {game && emitter && entity && affected ? (
        <div className="system-body effect-workspace">
          <div className="effect-grid particle-grid">
            <div className="effect-preview-card effect-stack">
              <div className="effect-row">
                <button onClick={() => setPlaying(!playing)}>
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                  {playing ? "Pause Preview" : "Play Preview"}
                </button>
                <button
                  onClick={() => {
                    burst.current = true;
                    setPlaying(true);
                  }}
                >
                  <Sparkles size={14} /> Preview Burst
                </button>
              </div>
              <div className="timeline-preview">
                <RenderSurface
                  label="Particle emitter preview"
                  assets={project.assets}
                  getFrame={() => {
                    const now = performance.now();
                    const delta = previous.current
                      ? (now - previous.current) / 1000
                      : 0;
                    previous.current = now;
                    if (playing) {
                      game.previewParticles(affected, burst.current, delta);
                      burst.current = false;
                    }
                    const center = game.worldPoint(affected)!;
                    return game.frame({
                      x: center.x + entity.transform.width / 2,
                      y: center.y + entity.transform.height / 2,
                      zoom: game.view().zoom,
                    });
                  }}
                />
              </div>
            </div>
            <section
              className="effect-card effect-stack"
              aria-label="Emitter properties"
            >
              <Field label="Emit on scene start">
                <input
                  type="checkbox"
                  aria-label="Emit on scene start"
                  checked={emitter.enabled}
                  onChange={(event) =>
                    change((draft) => {
                      draft.enabled = event.target.checked;
                    })
                  }
                />
              </Field>
              <Field label="Color">
                <input
                  aria-label="Particle color"
                  type="color"
                  value={emitter.color}
                  onChange={(event) =>
                    change((draft) => {
                      draft.color = event.target.value;
                    })
                  }
                />
              </Field>
              <div className="numeric-grid">
                {numericFields.map(([key, label, min, max, step]) => (
                  <Field label={label} key={key}>
                    <NumberField
                      label={label}
                      value={emitter[key]}
                      min={min}
                      max={max}
                      step={step}
                      onChange={(value) =>
                        change((draft) => {
                          draft[key] = value;
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <button
                className="danger"
                onClick={() =>
                  editEntity((draft) => {
                    delete draft.particles;
                  })
                }
              >
                <Trash2 size={14} /> Delete emitter
              </button>
            </section>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <Sparkles size={27} />
          <h2>Particle Emitters</h2>
          <p>
            {entity
              ? "Add an emitter to this entity."
              : "Select an entity in the Hierarchy."}
          </p>
        </div>
      )}
    </div>
  );
}
