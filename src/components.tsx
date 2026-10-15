import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { db } from "./data";
export function Logo({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className="logo">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={name + "台标占位"}>
          {name.trim().slice(0, 2).toUpperCase() || "电视"}
        </span>
      )}
    </span>
  );
}
export function LoginDialog({
  open,
  onClose,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  onNotice: (s: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState(""),
    [sending, setSending] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (open) {
      setMessage("");
      ref.current?.showModal();
    } else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="login-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="login-title"
    >
      <button className="dialog-close" onClick={onClose} aria-label="关闭登录">
        ×
      </button>
      <h2 id="login-title">登录，随处继续观看</h2>
      <p>游客可以直接观看。登录后同步收藏和最近观看记录。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!db || sending) return;
          setSending(true);
          setMessage("");
          try {
            const { error } = await db.auth.signInWithOtp({
              email,
              options: { emailRedirectTo: location.origin },
            });
            if (error) setMessage("发送失败，请稍后重试。" + error.message);
            else {
              onNotice("登录链接已发送，请检查邮箱。");
              onClose();
            }
          } catch {
            setMessage("网络连接失败，请稍后重试。");
          } finally {
            setSending(false);
          }
        }}
      >
        <label htmlFor="login-email">邮箱地址</label>
        <input
          id="login-email"
          autoComplete="email"
          type="email"
          required
          placeholder="你的邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="primary" disabled={!db || sending}>
          {sending ? "正在发送…" : "发送登录链接"}
        </button>
        {message && <p role="alert">{message}</p>}
      </form>
    </dialog>
  );
}

export class ExploreBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <>
        <p className="map-note">地球暂时不可用，已显示轻量地图。</p>
        {this.props.fallback}
      </>
    ) : (
      this.props.children
    );
  }
}
