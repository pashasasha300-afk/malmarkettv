import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Channel } from "../../src/data";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), player: vi.fn() }));
const channel: Channel = {
  id: "3ABNEnglish.us",
  name: "3ABN English",
  country: "US",
  languages: ["eng"],
  categories: ["news"],
  logo: "https://example.com/logo.png",
  website: "https://example.com",
  updated_at: "2026-10-15T00:00:00Z",
  streams: [
    {
      id: "source",
      url: "https://example.com/live.m3u8",
      labels: [],
      server_status: "unchecked",
      checked_at: null,
    },
  ],
};
vi.mock("../../src/data", () => ({
  db: {
    rpc: mocks.rpc,
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOtp: vi.fn(),
    },
  },
  localRead: (key: string) => JSON.parse(localStorage.getItem(key) || "[]"),
}));
vi.mock("../../src/World", () => ({
  default: () => <div data-testid="world">交互地球</div>,
}));
vi.mock("../../src/Player", () => ({
  Player: (props: any) => {
    mocks.player(props);
    return <button onClick={props.onPlayed}>测试触发真实播放回调</button>;
  },
}));
import { App } from "../../src/App";
import { Logo } from "../../src/components";
beforeEach(() => {
  window.innerWidth = 1440;
  mocks.rpc.mockImplementation(async (name, args) =>
    name === "country_counts"
      ? {
          data: [
            { code: "US", name: "United States", lat: 38, lng: -97, count: 1 },
          ],
          error: null,
        }
      : { data: args?.ids?.length === 0 ? [] : [channel], error: null },
  );
});
async function channelButton() {
  return screen.findByRole("button", { name: /3ABN English/ });
}
describe("探索与观看布局", () => {
  it("桌面先显示地球和频道；选台后播放器主区域，地球可收起和重新打开", async () => {
    const { container } = render(<App />);
    await screen.findByTestId("world");
    expect(
      container.querySelector("main")?.classList.contains("is-exploring"),
    ).toBe(true);
    expect(screen.queryByRole("region", { name: "正在观看" })).toBeNull();
    fireEvent.click(await channelButton());
    await screen.findByRole("region", { name: "正在观看" });
    expect(
      container.querySelector("main")?.classList.contains("is-watching"),
    ).toBe(true);
    expect(
      container.querySelector(".explore")?.classList.contains("compact"),
    ).toBe(true);
    expect((await channelButton()).getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "收起地球" }));
    expect(screen.queryByTestId("world")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "◎ 探索地球" }));
    await screen.findByTestId("world");
  });
  it("手机初始不加载地球，选台后播放器在频道之前且频道始终可见", async () => {
    window.innerWidth = 390;
    const { container } = render(<App />);
    expect(screen.queryByTestId("world")).toBeNull();
    fireEvent.click(await channelButton());
    await screen.findByRole("region", { name: "正在观看" });
    const main = container.querySelector("main")!;
    expect(main.firstElementChild?.classList.contains("watch")).toBe(true);
    expect(
      screen.getByRole("complementary", { name: "频道列表" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("world")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "◎ 探索地球" }));
    await screen.findByTestId("world");
  });
  it("邮箱表单仅在顶部登录入口打开后可访问", async () => {
    render(<App />);
    expect(screen.queryByRole("textbox", { name: "邮箱地址" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "邮箱地址" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭登录" }));
    expect(screen.queryByRole("textbox", { name: "邮箱地址" })).toBeNull();
  });
  it("中文分类/语言提交真实代码，清除筛选恢复全部", async () => {
    render(<App />);
    await channelButton();
    fireEvent.change(screen.getByRole("combobox", { name: "分类" }), {
      target: { value: "news" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "语言" }), {
      target: { value: "eng" },
    });
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "search_channels",
        expect.objectContaining({
          category_filter: "news",
          language_filter: "eng",
        }),
      ),
    );
    expect(
      within(screen.getByRole("combobox", { name: "分类" })).getByRole(
        "option",
        { name: "新闻" },
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("combobox", { name: "语言" })).getByRole(
        "option",
        { name: "英语" },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenLastCalledWith(
        "search_channels",
        expect.objectContaining({
          category_filter: "",
          language_filter: "",
          ids: null,
        }),
      ),
    );
  });
  it("播放回调后记住上次频道，下次打开显示继续观看而不自动拉流", async () => {
    const view = render(<App />);
    fireEvent.click(await channelButton());
    fireEvent.click(
      await screen.findByRole("button", { name: "测试触发真实播放回调" }),
    );
    expect(JSON.parse(localStorage.getItem("last-channel")!)).toEqual({
      id: channel.id,
      name: channel.name,
    });
    view.unmount();
    history.replaceState({}, "", "/");
    render(<App />);
    expect(
      screen.getByRole("button", { name: "▷ 继续观看：3ABN English" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "正在观看" })).toBeNull();
  });
  it("频道加载错误有重试入口，不伪装成空目录", async () => {
    mocks.rpc.mockImplementation(async (name) =>
      name === "country_counts"
        ? { data: [], error: null }
        : { data: null, error: { message: "network" } },
    );
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "重新加载频道" }),
    ).toBeTruthy();
    expect(screen.queryByText("没有找到频道")).toBeNull();
  });
  it("台标加载失败仍显示占位", () => {
    render(<Logo name="France 24" url="https://example.com/broken.png" />);
    fireEvent.error(document.querySelector("img")!);
    expect(screen.getByLabelText("France 24台标占位").textContent).toBe("FR");
  });
  it("收藏与最近观看保留，分享使用当前频道规范链接", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);
    fireEvent.click(await channelButton());
    fireEvent.click(await screen.findByRole("button", { name: "♡ 收藏频道" }));
    expect(JSON.parse(localStorage.getItem("favorites")!)).toEqual([
      channel.id,
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "测试触发真实播放回调" }),
    );
    expect(JSON.parse(localStorage.getItem("recent")!)).toEqual([channel.id]);
    fireEvent.click(screen.getByRole("button", { name: "分享频道" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        location.origin + "/?channel=" + channel.id,
      ),
    );
  });
});
