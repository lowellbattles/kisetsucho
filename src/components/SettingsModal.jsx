import { useState, useId } from "react";
import Modal from "./Modal.jsx";

/* ---------- settings modal ---------- */

function SettingsModal({ settings, onSave, onClose }) {
  const [key, setKey] = useState(settings.tmdbKey || "");
  const [annict, setAnnict] = useState(settings.annictToken || "");
  const titleId = useId();
  return (
    <Modal onClose={onClose} labelledBy={titleId} className="settings-modal">
        <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>
        <h2 className="modal-title" id={titleId}>設定 <span className="en-hint">Settings</span></h2>
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
            aria-label="TMDB APIキー"
            autoComplete="off"
          />
        </section>
        <section className="modal-section">
          <h4>Annictトークン</h4>
          <p className="fine">
            日本のTV放送情報・満足度・スタッフ情報の取得に使用します。
            annict.com の「設定 → デベロッパー」で個人用アクセストークンを作成できます（読み込み専用でOK）。
            Annictとの同期（記録画面）には「読み込み + 書き込み」スコープが必要です。
            この端末のブラウザにのみ保存されます。
          </p>
          <input
            className="settings-input"
            type="text"
            value={annict}
            onChange={(e) => setAnnict(e.target.value)}
            placeholder="Annict Access Token"
            aria-label="Annictトークン"
            autoComplete="off"
          />
        </section>
        <div className="settings-actions">
          <button
            className="toolbar-btn on"
            onClick={() => { onSave({ ...settings, tmdbKey: key.trim(), annictToken: annict.trim() }); onClose(); }}
          >
            保存
          </button>
        </div>
    </Modal>
  );
}

export default SettingsModal;
