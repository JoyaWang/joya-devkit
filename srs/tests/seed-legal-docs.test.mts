import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = resolve(import.meta.dirname, "..");

function readInfoVDocument(filename: string): string {
  return readFileSync(resolve(ROOT_DIR, "scripts/legal-docs/infov", filename), "utf-8");
}

function readLaicaiDocument(filename: string): string {
  return readFileSync(resolve(ROOT_DIR, "scripts/legal-docs/laicai", filename), "utf-8");
}

describe("InfoV user agreement content", () => {
  it("contains correct InfoV product identity and descriptions", () => {
    const html = readInfoVDocument("user-agreement.html");

    // Correct product identity
    expect(html).toContain("家信柜（InfoV）用户协议");
    expect(html).toContain("家信柜（InfoV）");
    expect(html).toContain("家庭为单位的信息安全归档与家庭资料管理应用软件");

    // Correct features and capabilities
    expect(html).toContain("家庭信息安全归档、家庭资料管理和家庭成员间协作服务");
    expect(html).toContain("【设置 - 账号与安全 - 注销账号】");
    expect(html).toContain("AES-256");
    expect(html).toContain("加密存储和同步服务");

    // Correct ICP and version
    expect(html).toContain("陕ICP备2026002096号-2");
  });

  it("does not contain Laicai marketplace or community content", () => {
    const html = readInfoVDocument("user-agreement.html");

    // No Laicai product name
    expect(html).not.toContain("来财");

    // No marketplace / trading terms
    expect(html).not.toContain("邻里为本");
    expect(html).not.toContain("闲置共享");
    expect(html).not.toContain("帖子、图片、报价");
    expect(html).not.toContain("法律限制交易的物品");
    expect(html).not.toContain("信息发布和社区交流的平台");
    expect(html).not.toContain("线下交易");
    expect(html).not.toContain("面交");
    expect(html).not.toContain("租赁或提供劳务互助");
    expect(html).not.toContain("人情分");
    expect(html).not.toContain("反馈中心");
    expect(html).not.toContain("交易安全");
    expect(html).not.toContain("信息中介");
    expect(html).not.toContain("纠纷免责");
    expect(html).not.toContain("公开发布");

    // No location / map references
    expect(html).not.toContain("地图");
    expect(html).not.toContain("定位");

    // No Laicai ICP
    expect(html).not.toContain("陕ICP备2026002096号-1");
  });
});

describe("InfoV privacy policy content", () => {
  it("contains correct InfoV data collection and SDK information", () => {
    const html = readInfoVDocument("privacy-policy.html");

    // Correct product identity
    expect(html).toContain("家信柜（InfoV）隐私政策");
    expect(html).toContain("家庭信息安全归档与家庭资料管理服务");

    // Correct data collection description
    expect(html).toContain("账号注册、身份验证、家庭信息归档、文件管理、家庭成员协作等基本功能");
    expect(html).toContain("家庭文档、照片、音视频等资料");
    expect(html).toContain("AES-256");

    // Correct SDK list
    expect(html).toContain("device_info_plus");
    expect(html).toContain("flutter_secure_storage");
    expect(html).toContain("sqflite");
    expect(html).toContain("Shared Runtime Services (SRS)");

    // Correct ICP and version
    expect(html).toContain("陕ICP备2026002096号-2");
  });

  it("does not collect location, IM, trading data, or use Laicai-specific SDKs", () => {
    const html = readInfoVDocument("privacy-policy.html");

    // No Laicai product name
    expect(html).not.toContain("来财");

    // No location collection — the "特别说明" box says "不会收集您的位置信息"
    // which is a positive declaration of NOT collecting, so "位置信息" may appear there.
    // Instead, assert no dedicated location section or SDK.
    expect(html).not.toContain("百度地图");
    expect(html).not.toContain("百度定位");
    expect(html).not.toContain("地理位置");
    expect(html).not.toContain("地图定位");
    expect(html).not.toContain("1.3 位置信息");
    expect(html).not.toContain("附近的需求和供给信息");

    // No trading / marketplace
    expect(html).not.toContain("订单交易");
    expect(html).not.toContain("人情分");
    expect(html).not.toContain("交易金额");
    expect(html).not.toContain("配送方式");
    expect(html).not.toContain("发布信息");

    // No IM chat
    expect(html).not.toContain("即时通讯");
    expect(html).not.toContain("聊天记录");

    // No face recognition / real-name verification
    expect(html).not.toContain("人脸核身");
    expect(html).not.toContain("实名认证");

    // No third-party push SDK
    expect(html).not.toContain("个推");
    expect(html).not.toContain("GeTui");

    // No Tencent CloudBase
    expect(html).not.toContain("腾讯云开发");

    // "特别说明" says "不收集设备 MAC 地址" / "不收集软件安装列表" — positive declarations.
    // Assert no dedicated MAC/install-list collection section instead.
    expect(html).not.toContain("设备 MAC 地址：");
    expect(html).not.toContain("软件安装列表：");
    expect(html).not.toContain("读取设备的 MAC");
    expect(html).not.toContain("已安装应用信息");

    // No IDFA/IDFV/OAID device identifier collection sections
    expect(html).not.toContain("IDFA（广告标识符）");
    expect(html).not.toContain("IDFV（供应商标识符）");
    expect(html).not.toContain("OAID（匿名设备标识符）");

    // No Laicai ICP
    expect(html).not.toContain("陕ICP备2026002096号-1");
  });
});

describe("InfoV documents are independent from Laicai", () => {
  it("user agreement is substantially different from Laicai's", () => {
    const infovHtml = readInfoVDocument("user-agreement.html");
    const laicaiHtml = readLaicaiDocument("user-agreement.html");

    // They should not be identical
    expect(infovHtml).not.toBe(laicaiHtml);

    // InfoV should not contain any of Laicai's signature marketplace sections
    expect(infovHtml).not.toContain("信息中介性质");
    expect(infovHtml).not.toContain("交易安全提醒");
    expect(infovHtml).not.toContain("线下履约能力");
  });

  it("privacy policy is substantially different from Laicai's", () => {
    const infovHtml = readInfoVDocument("privacy-policy.html");
    const laicaiHtml = readLaicaiDocument("privacy-policy.html");

    // They should not be identical
    expect(infovHtml).not.toBe(laicaiHtml);

    // InfoV should not contain Laicai's SDK table entries
    expect(infovHtml).not.toContain("慧眼");
    expect(infovHtml).not.toContain("消息推送 SDK");
  });
});
