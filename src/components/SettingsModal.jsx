import { useState } from "react";

/* ---------- settings modal ---------- */

function SettingsModal({ settings, onSave, onClose }) {
  const [key, setKey] = useState(settings.tmdbKey || "");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>
        <h2 className="modal-title">設定 <span className="en-hint">Settings</span></h2>
        <section className="modal-section">
          <h4>TMDB APIキー</h4>
          <p className="fine">
            日本語のあらすじと日本国内の配信情報（JustWatch提供・TMDB経由）の取得に使用します。
            キーは themoviedb.org の「設定 → API」で取得できます。この端末のブラウザにのみ保存されます。
          </p>
          <input
            className="settings-input"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="TMDB API Key"
            autoComplete="off"
          />
        </section>
        <div className="settings-actions">
          <button className="toolbar-btn on" onClick={() => { onSave({ ...settings, tmdbKey: key.trim() }); onClose(); }}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
