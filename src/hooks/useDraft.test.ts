import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDraft } from "./useDraft";

describe("useDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  it("returns empty string when no draft saved", () => {
    const { result } = renderHook(() => useDraft("test-empty"));
    expect(result.current[0]).toBe("");
  });

  it("restores existing draft from localStorage on mount", () => {
    window.localStorage.setItem("nexyra:draft:test-restore", "hello");
    const { result } = renderHook(() => useDraft("test-restore"));
    expect(result.current[0]).toBe("hello");
  });

  it("persists value after debounce delay", () => {
    const { result } = renderHook(() => useDraft("test-save", 500));
    act(() => {
      result.current[1]("typing...");
    });
    expect(window.localStorage.getItem("nexyra:draft:test-save")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(window.localStorage.getItem("nexyra:draft:test-save")).toBe("typing...");
  });

  it("clear() empties value and removes from storage", () => {
    window.localStorage.setItem("nexyra:draft:test-clear", "previous");
    const { result } = renderHook(() => useDraft("test-clear"));
    expect(result.current[0]).toBe("previous");
    act(() => {
      result.current[2]();
    });
    expect(result.current[0]).toBe("");
    expect(window.localStorage.getItem("nexyra:draft:test-clear")).toBeNull();
  });

  it("removes empty value from storage", () => {
    window.localStorage.setItem("nexyra:draft:test-empty-write", "x");
    const { result } = renderHook(() => useDraft("test-empty-write", 100));
    act(() => {
      result.current[1]("");
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(window.localStorage.getItem("nexyra:draft:test-empty-write")).toBeNull();
  });
});
