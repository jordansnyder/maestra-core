import { useState, useEffect, useCallback } from "react";
import { readEnv, writeEnv, getEnvPath } from "../lib/invoke";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveAndRestart: () => void;
}

export function EnvEditor({ visible, onClose, onSaveAndRestart }: Props) {
  const [content, setContent] = useState("");
  const [envPath, setEnvPath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [text, path] = await Promise.all([readEnv(), getEnvPath()]);
      setContent(text);
      setEnvPath(path);
      setDirty(false);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await writeEnv(content);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndRestart = async () => {
    setSaving(true);
    setError(null);
    try {
      await writeEnv(content);
      setDirty(false);
      onSaveAndRestart();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-surface-1 border border-surface-3 rounded-2xl w-[700px] max-h-[80vh] flex flex-col shadow-2xl animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3">
          <div>
            <h2 className="text-base font-semibold text-gray-100">
              Environment Settings
            </h2>
            <p className="text-[11px] text-gray-600 mt-0.5 font-mono">{envPath}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-200 rounded-lg hover:bg-surface-3 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Warning */}
        <div className="px-5 py-2.5 bg-accent-amber/5 border-b border-accent-amber/10">
          <p className="text-xs text-accent-amber/80 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            Advanced — changes require a restart to take effect
          </p>
        </div>

        {error && (
          <div className="px-5 py-2 bg-accent-rose/5 border-b border-accent-rose/10">
            <p className="text-xs text-accent-rose">{error}</p>
          </div>
        )}

        {/* Editor */}
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          className="flex-1 bg-surface-0 text-gray-300 font-mono text-sm p-5 resize-none focus:outline-none min-h-[300px] leading-relaxed selection:bg-maestra-500/30"
          spellCheck={false}
        />

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-surface-3 bg-surface-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-200 rounded-lg hover:bg-surface-3 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 text-sm bg-surface-3 text-gray-200 rounded-lg hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Save
          </button>
          <button
            onClick={handleSaveAndRestart}
            disabled={!dirty || saving}
            className="px-4 py-2 text-sm bg-maestra-600 text-white rounded-lg hover:bg-maestra-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-glow"
          >
            Save & Restart
          </button>
        </div>
      </div>
    </div>
  );
}
