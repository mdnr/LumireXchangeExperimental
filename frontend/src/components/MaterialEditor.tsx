import type { Material } from '../lib/types';

interface MaterialEditorProps {
  material: Material;
  onChange: (material: Material) => void;
}

function set<K extends keyof Material>(material: Material, key: K, value: Material[K]): Material {
  return { ...material, [key]: value };
}

export function MaterialEditor({ material, onChange }: MaterialEditorProps) {
  const isChrome = material.finish === 'chrome';

  return (
    <div className="material-editor">
      <div className="editor-row">
        <label className="field">
          <span>Finish</span>
          <select
            value={material.finish}
            onChange={(e) => onChange(set(material, 'finish', e.target.value === 'chrome' ? 'chrome' : 'matte'))}
          >
            <option value="matte">Matte</option>
            <option value="chrome">Chrome</option>
          </select>
        </label>
        <label className="field">
          <span>Base color</span>
          <span className="color-input">
            <input
              type="color"
              value={material.color}
              onChange={(e) => onChange(set(material, 'color', e.target.value))}
              aria-label="Base color"
            />
            <code>{material.color}</code>
          </span>
        </label>
      </div>

      <label className="field">
        <span>
          Metalness <output>{Math.round(material.metalness * 100)}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          disabled={isChrome}
          value={material.metalness}
          onChange={(e) => onChange(set(material, 'metalness', Number(e.target.value)))}
        />
      </label>

      <label className="field">
        <span>
          Roughness <output>{Math.round(material.roughness * 100)}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={material.roughness}
          onChange={(e) => onChange(set(material, 'roughness', Number(e.target.value)))}
        />
      </label>

      <label className="field">
        <span>
          Clearcoat <output>{Math.round(material.clearcoat * 100)}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          disabled={isChrome}
          value={material.clearcoat}
          onChange={(e) => onChange(set(material, 'clearcoat', Number(e.target.value)))}
        />
      </label>

      <p className="muted small">
        {isChrome ? 'Chrome forces high metalness for a mirror-like sheen.' : 'Adjust the surface feel; the 3D preview updates live.'}
      </p>
    </div>
  );
}