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

const INFOV_FORBIDDEN_TERMS = [
  // Laicai / marketplace / community semantics
  "来财",
  "邻里",
  "闲置",
  "社区",
  "帖子",
  "报价",
  "交易",
  "订单",
  "人情分",
  "面交",
  "租赁",
  "劳务互助",
  "信息中介",
  "纠纷免责",
  "公开发布",
  "发布信息",
  "供给",
  "需求",
  "市场",
  "商家",
  "商品",
  "配送",
  // Unsupported collection / SDK semantics
  "位置",
  "地图",
  "定位",
  "百度",
  "个推",
  "GeTui",
  "慧眼",
  "实名",
  "人脸",
  "身份证号码",
  "通讯录",
  "短信",
  "通话记录",
  "软件安装列表",
  "MAC 地址",
  "OAID",
  "IDFA",
  "IDFV",
  // Unsupported app features
  "即时通讯",
  "聊天",
  "私聊",
  "推送",
  "广告",
  "画像",
  "家庭协作",
  "家庭成员间协作",
  "以家庭为单位",
];

describe("InfoV user agreement content", () => {
  it("contains accurate InfoV product identity and capabilities", () => {
    const html = readInfoVDocument("user-agreement.html");

    expect(html).toContain("家信柜（InfoV）用户协议");
    expect(html).toContain("以<strong>人员为核心</strong>的重要资料安全管理应用");
    expect(html).toContain("本人、家庭成员或其他需要妥善保存资料的人员");
    expect(html).toContain("证件、保险、就医、自定义资料及相关附件");
    expect(html).toContain("【设置 - 账号与安全 - 注销账号】");
    expect(html).toContain("拍照");
    expect(html).toContain("相册选择");
    expect(html).toContain("文件选择");
    expect(html).toContain("文字识别");
    expect(html).toContain("保存到相册");
    expect(html).toContain("导出文件");
    expect(html).toContain("陕ICP备2026002096号-2");
  });

  it("does not contain Laicai, unsupported collection, or inaccurate feature semantics", () => {
    const html = readInfoVDocument("user-agreement.html");

    for (const term of INFOV_FORBIDDEN_TERMS) {
      expect(html, `forbidden term found: ${term}`).not.toContain(term);
    }
    expect(html).not.toContain("陕ICP备2026002096号-1");
  });
});

describe("InfoV privacy policy content", () => {
  it("contains only actual InfoV information categories and capabilities", () => {
    const html = readInfoVDocument("privacy-policy.html");

    expect(html).toContain("家信柜（InfoV）隐私政策");
    expect(html).toContain("以人员为核心的重要资料安全管理工具");
    expect(html).toContain("账号信息");
    expect(html).toContain("人员基础资料");
    expect(html).toContain("证件、保险、就医、自定义分类");
    expect(html).toContain("附件");
    expect(html).toContain("相机");
    expect(html).toContain("照片库");
    expect(html).toContain("文件访问");
    expect(html).toContain("生物识别");
    expect(html).toContain("google_mlkit_text_recognition");
    expect(html).toContain("flutter_secure_storage");
    expect(html).toContain("sqflite / sqlcipher_flutter_libs");
    expect(html).toContain("Joya Shared Runtime Services (SRS)");
    expect(html).toContain("陕ICP备2026002096号-2");
  });

  it("does not contain unsupported collection, SDK, marketplace, or community semantics anywhere", () => {
    const html = readInfoVDocument("privacy-policy.html");

    for (const term of INFOV_FORBIDDEN_TERMS) {
      expect(html, `forbidden term found: ${term}`).not.toContain(term);
    }
    expect(html).not.toContain("陕ICP备2026002096号-1");
  });
});

describe("InfoV documents are independent from Laicai", () => {
  it("user agreement is substantially different from Laicai's", () => {
    const infovHtml = readInfoVDocument("user-agreement.html");
    const laicaiHtml = readLaicaiDocument("user-agreement.html");

    expect(infovHtml).not.toBe(laicaiHtml);
    expect(infovHtml).not.toContain("信息中介性质");
    expect(infovHtml).not.toContain("交易安全提醒");
    expect(infovHtml).not.toContain("线下履约能力");
  });

  it("privacy policy is substantially different from Laicai's", () => {
    const infovHtml = readInfoVDocument("privacy-policy.html");
    const laicaiHtml = readLaicaiDocument("privacy-policy.html");

    expect(infovHtml).not.toBe(laicaiHtml);
    expect(infovHtml).not.toContain("慧眼");
    expect(infovHtml).not.toContain("消息推送 SDK");
  });
});
