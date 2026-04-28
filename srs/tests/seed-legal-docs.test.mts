import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createInfoVPrivacyPolicy, createInfoVUserAgreement } from "../scripts/seed-legal-docs.js";

const ROOT_DIR = resolve(import.meta.dirname, "..");

function readLaicaiSnapshot(filename: string): string {
  return readFileSync(resolve(ROOT_DIR, "scripts/legal-docs/laicai", filename), "utf-8");
}

describe("seed-legal-docs InfoV content adapter", () => {
  it("rewrites Laicai user agreement into InfoV-specific business semantics", () => {
    const { contentHtml } = createInfoVUserAgreement(readLaicaiSnapshot("user-agreement.html"));

    expect(contentHtml).toContain("家信柜（InfoV）用户协议");
    expect(contentHtml).toContain("以家庭为单位的信息安全归档与家庭资料管理应用软件");
    expect(contentHtml).toContain("家庭信息安全归档、家庭资料管理和家庭成员间协作服务");
    expect(contentHtml).toContain("【设置 - 账号与安全 - 注销账号】");
    expect(contentHtml).not.toContain("邻里为本");
    expect(contentHtml).not.toContain("闲置共享");
    expect(contentHtml).not.toContain("帖子、图片、报价、私聊内容");
    expect(contentHtml).not.toContain("法律限制交易的物品");
    expect(contentHtml).not.toContain("线下交易行为");
    expect(contentHtml).not.toContain("反馈中心");
  });

  it("rewrites Laicai privacy policy into InfoV-specific data semantics", () => {
    const { contentHtml } = createInfoVPrivacyPolicy(readLaicaiSnapshot("privacy-policy.html"));

    expect(contentHtml).toContain("家信柜（InfoV）隐私政策");
    expect(contentHtml).toContain("账号注册、身份验证、家庭信息归档、文件管理、家庭成员协作等基本功能");
    expect(contentHtml).toContain("Shared Runtime Services (SRS)");
    expect(contentHtml).not.toContain("百度地图");
    expect(contentHtml).not.toContain("百度定位");
    expect(contentHtml).not.toContain("个推");
    expect(contentHtml).not.toContain("订单交易");
    expect(contentHtml).not.toContain("地图定位");
    expect(contentHtml).not.toContain("人情分");
  });
});
