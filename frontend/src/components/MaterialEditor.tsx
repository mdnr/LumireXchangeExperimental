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
          Metalness{' '}
          <output>{isChrome ? 'chrome' : `${Math.round(material.metalness * 100)}%`}</output>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          disabled={isChrome}
          value={Math.round(material.metalness * 100)}
          onChange={(e) => onChange(set(material, 'metalness', Number(e.target.value) / 100))}
        />
      </label>

      <label className="field">
        <span>
          Roughness{' '}
          <output>{isChrome ? 'chrome' : `${Math.round(material.roughness * 100)}%`}</output>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          disabled={isChrome}
          value={Math.round(material.roughness * 100)}
          onChange={(e) => onChange(set(material, 'roughness', Number(e.target.value) / 100))}
        />
      </label>

      <label className="field">
        <span>
          Clear{' '}
          <output>
            {(material.transparency ?? 0) === 0
              ? 'opaque'
              : `${Math.round((material.transparency ?? 0) * 100)}%`}
          </output>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round((material.transparency ?? 0) * 100)}
          onChange={(e) => onChange(set(material, 'transparency', Number(e.target.value) / 100))}
        />
      </label>

      <p className="muted small">
        {isChrome
          ? 'Chrome forces high metalness and a low roughness for a mirror-like sheen.'
          : 'Clear runs from opaque to see-through. Adjust the surface feel; the 3D preview updates live.'}
      </p>
    </div>
  );
}