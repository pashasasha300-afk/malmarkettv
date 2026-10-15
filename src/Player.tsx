import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Channel } from "./data";
export function Player({
  channel,
  onPlayed,
}: {
  channel: Channel;
  onPlayed: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null),
    hls = useRef<Hls | null>(null);
  const [index, setIndex] = useState(0),
    [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState(""),
    [levels, setLevels] = useState<number[]>([]),
    [quality, setQuality] = useState(-1);
  const callback = useRef(onPlayed);
  callback.current = onPlayed;
  useEffect(() => {
    setIndex(0);
    setAttempt(0);
  }, [channel.id]);
  useEffect(() => {
    const video = ref.current!;
    const source = channel.streams[index];
    let disposed = false,
      failed = false;
    let timer: ReturnType<typeof setTimeout>;
    setLevels([]);
    setQuality(-1);
    const fail = (reason: string) => {
      if (disposed || failed) return;
      failed = true;
      clearTimeout(timer);
      hls.current?.destroy();
      hls.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      setStatus(reason);
      if (attempt < 1) setAttempt((a) => a + 1);
      else if (index < channel.streams.length - 1) {
        setAttempt(0);
        setIndex((i) => i + 1);
      } else setStatus(reason + "；已停止重试，可换台或手动重试。");
    };
    const watchdog = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fail("网络或直播源超时"), 20000);
    };
    const playing = () => {
      clearTimeout(timer);
      setStatus("正在直播 · 本次浏览器播放已验证");
      callback.current();
    };
    const waiting = () => {
      setStatus("缓冲中");
      watchdog();
    };
    const play = () => {
      video.play().catch((e) => {
        if (disposed) return;
        if (e.name === "NotAllowedError") {
          clearTimeout(timer);
          setStatus("请点击视频播放按钮");
        } else fail("浏览器无法解码或网络错误");
      });
    };
    const error = () =>
      fail(
        video.error?.code === 4
          ? "浏览器格式不支持或源响应异常"
          : "网络或媒体解码错误",
      );
    video.addEventListener("playing", playing);
    video.addEventListener("waiting", waiting);
    video.addEventListener("error", error);
    if (!source) {
      setStatus("没有可用直播源");
      return;
    }
    setStatus(
      `连接直播源 ${index + 1}/${channel.streams.length} · 尝试 ${attempt + 1}/2`,
    );
    watchdog();
    if (!source.url.startsWith("https://"))
      fail("HTTPS 页面无法播放 HTTP 直播源");
    else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source.url;
      play();
    } else if (Hls.isSupported()) {
      const instance = new Hls({
        enableWorker: true,
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 8000,
            maxLoadTimeMs: 12000,
            timeoutRetry: null,
            errorRetry: null,
          },
        },
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 8000,
            maxLoadTimeMs: 15000,
            timeoutRetry: null,
            errorRetry: null,
          },
        },
      });
      hls.current = instance;
      instance.attachMedia(video);
      instance.loadSource(source.url);
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(instance.levels.map((l) => l.height));
        play();
      });
      instance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          const code = data.response?.code;
          fail(
            code === 403 || code === 451
              ? "访问受限（可能地区或提供方限制）"
              : code === 404 || code === 410
                ? "直播源已失效"
                : data.type === Hls.ErrorTypes.MEDIA_ERROR
                  ? "浏览器编码不支持或媒体损坏"
                  : "网络 / CORS 错误（浏览器无法进一步区分）",
          );
        }
      });
    } else fail("此浏览器不支持 HLS");
    return () => {
      disposed = true;
      clearTimeout(timer);
      video.removeEventListener("playing", playing);
      video.removeEventListener("waiting", waiting);
      video.removeEventListener("error", error);
      hls.current?.destroy();
      hls.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel.id, index, attempt]);
  return (
    <>
      <video
        ref={ref}
        controls
        playsInline
        aria-label={channel.name + "直播播放器"}
      />
      <div className="player-status">
        <span>{status}</span>
        <button
          onClick={() => {
            setIndex(0);
            setAttempt((a) => (a === 0 ? 1 : 0));
          }}
        >
          重试
        </button>
      </div>
      <div className="tools">
        <button
          onClick={() => {
            const v = ref.current;
            if (v && document.pictureInPictureEnabled)
              v.requestPictureInPicture().catch(() =>
                setStatus("画中画暂不可用"),
              );
          }}
        >
          画中画
        </button>
        {levels.length > 0 && (
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
            {levels.map((h, i) => (
              <option key={i} value={i}>
                {h || "未知"}p
              </option>
            ))}
          </select>
        )}
      </div>
      <small>
        源状态：{channel.streams[index]?.server_status || "未检查"} ·{" "}
        {channel.streams[index]?.checked_at
          ? new Date(channel.streams[index].checked_at!).toLocaleString()
          : "尚无服务端检查"}
        <br />
        服务端检查不验证浏览器 CORS、编码或地区可播放性。
      </small>
    </>
  );
}
