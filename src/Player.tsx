import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import type { Channel } from "./data";
import { storeValue, volumePreference } from "./presentation";
type Phase = "loading" | "playing" | "paused" | "blocked" | "failed";
type NativeVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
export function Player({
  channel,
  onPlayed,
}: {
  channel: Channel;
  onPlayed: () => void;
}) {
  const ref = useRef<NativeVideo>(null),
    screen = useRef<HTMLDivElement>(null),
    hls = useRef<Hls | null>(null),
    callback = useRef(onPlayed);
  callback.current = onPlayed;
  const [connection, setConnection] = useState({
      index: 0,
      attempt: 0,
      nonce: 0,
    }),
    [phase, setPhase] = useState<Phase>("loading"),
    [message, setMessage] = useState("正在连接直播…"),
    [technical, setTechnical] = useState(""),
    [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]),
    [quality, setQuality] = useState(-1),
    [ready, setReady] = useState(false),
    [pipSupported, setPipSupported] = useState(false),
    [fullscreenSupported, setFullscreenSupported] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [controlNotice, setControlNotice] = useState("");
  const { index, attempt } = connection;
  useEffect(() => {
    const video = ref.current!;
    const preference = volumePreference();
    video.volume = preference.volume;
    video.muted = preference.muted;
    const save = () =>
      storeValue("player-volume", { volume: video.volume, muted: video.muted });
    video.addEventListener("volumechange", save);
    setPipSupported(
      !!document.pictureInPictureEnabled &&
        typeof video.requestPictureInPicture === "function",
    );
    setFullscreenSupported(
      !!(document.fullscreenEnabled && screen.current?.requestFullscreen) ||
        typeof video.webkitEnterFullscreen === "function",
    );
    const changed = () =>
      setFullscreen(document.fullscreenElement === screen.current);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      video.removeEventListener("volumechange", save);
      document.removeEventListener("fullscreenchange", changed);
    };
  }, []);
  useEffect(() => {
    const video = ref.current!;
    const source = channel.streams[index];
    let disposed = false,
      failed = false,
      reported = false;
    let timer: ReturnType<typeof setTimeout> | undefined,
      recovery: ReturnType<typeof setTimeout> | undefined;
    setLevels([]);
    setQuality(-1);
    setReady(false);
    setControlNotice("");
    setPhase("loading");
    setMessage("正在连接直播…");
    setTechnical("");
    const clearWatchdog = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const release = () => {
      hls.current?.destroy();
      hls.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    const fail = (reason: string, detail: string) => {
      if (disposed || failed) return;
      failed = true;
      clearWatchdog();
      setReady(false);
      setTechnical(detail);
      release();
      const next =
        attempt < 1
          ? { index, attempt: attempt + 1, nonce: connection.nonce }
          : index < channel.streams.length - 1
            ? { index: index + 1, attempt: 0, nonce: connection.nonce }
            : null;
      if (next) {
        setPhase("loading");
        setMessage(
          reason +
            (next.index !== index ? " 正在尝试备用源…" : " 正在重新连接…"),
        );
        recovery = setTimeout(() => {
          if (!disposed) setConnection(next);
        }, 700);
      } else {
        setPhase("failed");
        setMessage(reason + " 已停止自动重试，请重试或选择其他频道。");
      }
    };
    const watchdog = () => {
      if (!timer && !failed && !disposed)
        timer = setTimeout(
          () => fail("连接超时。", "20 秒内未能开始或恢复播放。"),
          20000,
        );
    };
    const play = () => {
      if (disposed || failed) return;
      watchdog();
      video.play().catch((e) => {
        if (disposed || failed) return;
        if (e.name === "NotAllowedError") {
          clearWatchdog();
          setPhase("blocked");
          setMessage("点击播放，开始观看。");
        } else fail("暂时无法播放。", e.message || "浏览器播放请求失败");
      });
    };
    const playing = () => {
      if (disposed || failed) return;
      clearWatchdog();
      setReady(true);
      setPhase("playing");
      setMessage("正在播放");
      if (!reported) {
        reported = true;
        callback.current();
      }
    };
    const waiting = () => {
      if (disposed || failed) return;
      setPhase("loading");
      setMessage("正在缓冲…");
      watchdog();
    };
    const paused = () => {
      if (disposed || failed) return;
      clearWatchdog();
      setPhase((previous) => (previous === "blocked" ? "blocked" : "paused"));
      setMessage("已暂停");
    };
    const metadata = () => {
      if (!disposed && !failed) setReady(true);
    };
    const error = () => {
      const code = video.error?.code;
      fail(
        code === 4 ? "此浏览器暂时无法播放该视频。" : "直播暂时中断。",
        `MediaError ${code || "未知"}: ${video.error?.message || "网络、源响应或媒体解码异常"}`,
      );
    };
    const ended = () =>
      fail("直播已结束或暂时中断。", "提供方触发 ended 事件。");
    video.addEventListener("playing", playing);
    video.addEventListener("waiting", waiting);
    video.addEventListener("pause", paused);
    video.addEventListener("loadedmetadata", metadata);
    video.addEventListener("error", error);
    video.addEventListener("ended", ended);
    video.addEventListener("play", watchdog);
    if (!source) {
      setPhase("failed");
      setMessage("此频道暂无可播放的直播源。");
      failed = true;
    } else if (!source.url.startsWith("https://"))
      fail("此源暂时无法在本站播放。", "HTTPS 页面禁止连接 HTTP 视频源。");
    else {
      watchdog();
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source.url;
        play();
      } else {
        void import("hls.js")
          .then(({ default: Hls }) => {
            if (disposed || failed) return;
            if (!Hls.isSupported()) {
              fail(
                "此浏览器不支持直播播放。",
                "原生 HLS 和 MediaSource 均不可用。",
              );
              return;
            }
            const loadPolicy = {
              default: {
                maxTimeToFirstByteMs: 8000,
                maxLoadTimeMs: 15000,
                timeoutRetry: null,
                errorRetry: null,
              },
            };
            const instance = new Hls({
              enableWorker: true,
              manifestLoadPolicy: loadPolicy,
              playlistLoadPolicy: loadPolicy,
              fragLoadPolicy: loadPolicy,
              keyLoadPolicy: loadPolicy,
            });
            hls.current = instance;
            instance.on(Hls.Events.MANIFEST_PARSED, () => {
              if (disposed || failed) return;
              setLevels(
                instance.levels.map((l) => ({
                  height: l.height,
                  bitrate: l.bitrate,
                })),
              );
              play();
            });
            instance.on(Hls.Events.ERROR, (_, data) => {
              if (!data.fatal) return;
              const code = data.response?.code;
              fail(
                code === 403 || code === 451
                  ? "提供方限制了此直播的访问。"
                  : code === 404 || code === 410
                    ? "此直播源暂不可用。"
                    : data.type === Hls.ErrorTypes.MEDIA_ERROR
                      ? "此视频暂时无法解码。"
                      : "暂时无法连接直播。",
                `HLS: ${data.details}; HTTP: ${code || "不可见"}。${data.type === Hls.ErrorTypes.NETWORK_ERROR ? "浏览器无法进一步区分网络与 CORS 错误。" : ""}`,
              );
            });
            instance.attachMedia(video);
            instance.loadSource(source.url);
          })
          .catch((e) => {
            if (!disposed)
              fail("播放器加载失败，请重试。", e.message || "HLS 模块加载失败");
          });
      }
    }
    return () => {
      disposed = true;
      clearWatchdog();
      clearTimeout(recovery);
      video.removeEventListener("playing", playing);
      video.removeEventListener("waiting", waiting);
      video.removeEventListener("pause", paused);
      video.removeEventListener("loadedmetadata", metadata);
      video.removeEventListener("error", error);
      video.removeEventListener("ended", ended);
      video.removeEventListener("play", watchdog);
      release();
    };
  }, [channel.id, connection]);
  const retry = () =>
    setConnection((previous) => ({
      index: 0,
      attempt: 0,
      nonce: previous.nonce + 1,
    }));
  const start = () => {
    setControlNotice("");
    ref.current?.play().catch((e) => {
      if (e.name === "NotAllowedError")
        setControlNotice("浏览器尚未允许播放，请使用视频自带的播放按钮。");
      else setControlNotice("无法开始播放，请点击重新连接。");
    });
  };
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled && screen.current?.requestFullscreen)
        await screen.current.requestFullscreen();
      else ref.current?.webkitEnterFullscreen?.();
    } catch {
      setControlNotice("暂时无法全屏，请使用视频自带的全屏按钮。");
    }
  };
  const pip = async () => {
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else await ref.current?.requestPictureInPicture();
    } catch {
      setControlNotice("暂时无法开启画中画，请稍后重试。");
    }
  };
  const serverStatus = channel.streams[index]?.server_status;
  const sourceStatus =
    serverStatus === "http_reachable_browser_unverified"
      ? "HTTP 可访问，浏览器播放未验证"
      : serverStatus === "unchecked" || !serverStatus
        ? "未检查"
        : serverStatus === "restricted"
          ? "访问受限"
          : serverStatus === "unavailable"
            ? "源暂不可用"
            : serverStatus === "network_error"
              ? "探测连接失败"
              : serverStatus === "blocked_target"
                ? "安全检查已阻止探测"
                : serverStatus;
  return (
    <div className="player">
      <div className="player-screen" ref={screen}>
        <video
          ref={ref}
          controls
          playsInline
          preload="none"
          aria-label={channel.name + "直播播放器"}
        />
        {phase === "loading" && (
          <div className="player-overlay loading-overlay" role="status">
            <span className="spinner" />
            <span>{message}</span>
          </div>
        )}
        {phase === "blocked" && (
          <div className="player-overlay">
            <button className="play-start" onClick={start}>
              ▷ 点击播放
            </button>
          </div>
        )}
        {phase === "failed" && (
          <div className="player-overlay failed-overlay">
            <strong>暂时无法播放</strong>
            <p>{message}</p>
            <button className="primary" onClick={retry}>
              重新连接
            </button>
          </div>
        )}
      </div>
      <div className="player-bar">
        <p
          role="status"
          className={
            phase === "failed" ? "playback-state error" : "playback-state"
          }
        >
          {phase === "playing" && <span className="live-dot" />}
          {message}
        </p>
        <div className="player-controls">
          {levels.length > 1 && (
            <select
              aria-label="清晰度"
              value={quality}
              onChange={(e) => {
                const n = Number(e.target.value);
                setQuality(n);
                if (hls.current) hls.current.currentLevel = n;
              }}
            >
              <option value={-1}>自动画质</option>
              {levels.map((l, i) => (
                <option key={i} value={i}>
                  {l.height
                    ? l.height + "p"
                    : Math.round(l.bitrate / 1000) + " kbps"}
                </option>
              ))}
            </select>
          )}
          {fullscreenSupported && (
            <button disabled={!ready} onClick={full}>
              {fullscreen ? "退出全屏" : "全屏"}
            </button>
          )}
          {pipSupported && (
            <button disabled={!ready} onClick={pip}>
              画中画
            </button>
          )}
          {phase !== "failed" && <button onClick={retry}>重新连接</button>}
        </div>
      </div>
      {controlNotice && (
        <p className="control-notice" role="status">
          {controlNotice}
        </p>
      )}
      <details className="technical-details">
        <summary>技术详情</summary>
        <dl>
          <dt>当前直播源</dt>
          <dd>
            {index + 1} / {channel.streams.length}，本源尝试 {attempt + 1} / 2
          </dd>
          <dt>源状态（服务端）</dt>
          <dd>{sourceStatus}</dd>
          <dt>最后检查</dt>
          <dd>
            {channel.streams[index]?.checked_at
              ? new Date(channel.streams[index].checked_at!).toLocaleString()
              : "暂无检查记录"}
          </dd>
          <dt>频道元数据更新</dt>
          <dd>{new Date(channel.updated_at).toLocaleString()}</dd>
          {technical && (
            <>
              <dt>本次播放诊断</dt>
              <dd>{technical}</dd>
            </>
          )}
        </dl>
        <p>
          服务端可访问不代表浏览器能播放；CORS、编码、地区或提供方限制仍可能影响播放。未取得可靠节目单，因此不显示节目安排。
        </p>
        <a
          href="https://github.com/iptv-org/iptv"
          target="_blank"
          rel="noreferrer"
        >
          直播源目录：iptv-org ↗
        </a>
      </details>
    </div>
  );
}
