import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Channel } from "../../src/data";
const hls = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock("hls.js", () => {
  class MockHls {
    static isSupported() {
      return true;
    }
    static Events = { MANIFEST_PARSED: "manifest", ERROR: "error" };
    static ErrorTypes = { MEDIA_ERROR: "media", NETWORK_ERROR: "network" };
    events: Record<string, Function> = {};
    levels = [
      { height: 720, bitrate: 2000000 },
      { height: 1080, bitrate: 4000000 },
    ];
    currentLevel = -1;
    destroy = vi.fn();
    attachMedia = vi.fn();
    loadSource = vi.fn();
    constructor() {
      hls.instances.push(this);
    }
    on(name: string, fn: Function) {
      this.events[name] = fn;
    }
    emit(name: string, data?: any) {
      this.events[name]?.(name, data);
    }
  }
  return { default: MockHls };
});
import { Player } from "../../src/Player";
import { volumePreference } from "../../src/presentation";
const channel: Channel = {
  id: "test",
  name: "测试频道",
  country: "US",
  languages: ["eng"],
  categories: ["news"],
  logo: null,
  website: null,
  updated_at: "2026-10-15T00:00:00Z",
  streams: [
    {
      id: "primary",
      url: "https://example.com/primary.m3u8",
      labels: [],
      server_status: "unchecked",
      checked_at: null,
    },
    {
      id: "backup",
      url: "https://example.com/backup.m3u8",
      labels: [],
      server_status: "unchecked",
      checked_at: null,
    },
  ],
};
beforeEach(() => {
  hls.instances.length = 0;
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  Object.defineProperty(document, "pictureInPictureEnabled", {
    configurable: true,
    value: false,
  });
});
async function mounted() {
  const result = render(<Player channel={channel} onPlayed={vi.fn()} />);
  await waitFor(() => expect(hls.instances).toHaveLength(1));
  return result;
}
describe("播放器控制和生命周期", () => {
  it("技术信息默认折叠，状态只在实际 playing 后成为正在播放", async () => {
    await mounted();
    const details = document.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("CORS");
    expect(screen.queryByText("正在播放")).toBeNull();
    fireEvent.playing(document.querySelector("video")!);
    expect(screen.getByText("正在播放")).toBeTruthy();
  });
  it("音量和静音跨播放器实例保留，损坏数据回落为合法值", async () => {
    localStorage.setItem(
      "player-volume",
      JSON.stringify({ volume: 0.35, muted: true }),
    );
    const view = await mounted();
    const video = document.querySelector("video")!;
    expect(video.volume).toBe(0.35);
    expect(video.muted).toBe(true);
    video.volume = 0.6;
    video.muted = false;
    fireEvent.volumeChange(video);
    expect(volumePreference()).toEqual({ volume: 0.6, muted: false });
    view.unmount();
    await mounted();
    expect(document.querySelector("video")!.volume).toBe(0.6);
    localStorage.setItem("player-volume", "broken");
    expect(volumePreference()).toEqual({ volume: 1, muted: false });
  });
  it("自动播放被拒后显示点击播放，不当作源失效重试", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(
      new DOMException("blocked", "NotAllowedError"),
    );
    await mounted();
    await act(async () => hls.instances[0].emit("manifest"));
    expect(
      await screen.findByRole("button", { name: "▷ 点击播放" }),
    ).toBeTruthy();
    expect(hls.instances).toHaveLength(1);
  });
  it("每源至多两轮；失败后切备用，全部失败后停止；手动重试重置主源", async () => {
    vi.useFakeTimers();
    render(<Player channel={channel} onPlayed={vi.fn()} />);
    await act(async () => {});
    expect(hls.instances).toHaveLength(1);
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        hls.instances[i].emit("error", {
          fatal: true,
          type: "network",
          details: "manifestLoadError",
          response: { code: 404 },
        });
      });
      if (i < 3)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(701);
        });
    }
    expect(hls.instances).toHaveLength(4);
    expect(hls.instances[0].loadSource).toHaveBeenCalledWith(
      channel.streams[0].url,
    );
    expect(hls.instances[1].loadSource).toHaveBeenCalledWith(
      channel.streams[0].url,
    );
    expect(hls.instances[2].loadSource).toHaveBeenCalledWith(
      channel.streams[1].url,
    );
    expect(hls.instances[3].loadSource).toHaveBeenCalledWith(
      channel.streams[1].url,
    );
    expect(screen.getByText("暂时无法播放")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(hls.instances).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    await act(async () => {});
    expect(hls.instances).toHaveLength(5);
    expect(hls.instances[4].loadSource).toHaveBeenCalledWith(
      channel.streams[0].url,
    );
  });
  it("切台销毁旧 HLS 并断开 video src，卸载清理当前连接", async () => {
    const view = await mounted();
    view.rerender(
      <Player channel={{ ...channel, id: "next" }} onPlayed={vi.fn()} />,
    );
    await waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(hls.instances[0].destroy).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    view.unmount();
    expect(hls.instances[1].destroy).toHaveBeenCalledOnce();
  });
  it("画中画仅在支持时出现，媒体就绪后可用；全屏调用平台 API", async () => {
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true,
    });
    const pip = vi.fn().mockResolvedValue({}),
      full = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(
      HTMLVideoElement.prototype,
      "requestPictureInPicture",
      { configurable: true, value: pip },
    );
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: full,
    });
    await mounted();
    const btn = screen.getByRole("button", {
      name: "画中画",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.loadedMetadata(document.querySelector("video")!);
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(pip).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "全屏" }));
    expect(full).toHaveBeenCalledOnce();
  });
  it("真实 manifest 清晰度才生成选项，未知高度不虚构分辨率", async () => {
    await mounted();
    expect(screen.queryByRole("combobox", { name: "清晰度" })).toBeNull();
    await act(async () => hls.instances[0].emit("manifest"));
    const quality = screen.getByRole("combobox", { name: "清晰度" });
    fireEvent.change(quality, { target: { value: "1" } });
    expect(hls.instances[0].currentLevel).toBe(1);
  });
});
