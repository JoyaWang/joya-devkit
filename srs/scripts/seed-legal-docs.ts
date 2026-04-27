/**
 * Seed script: populate LegalDocument for laicai and infov projects.
 *
 * Reads user-agreement.html and privacy-policy.html from infinex-site
 * as the Laicai template, then creates InfoV variants with appropriate
 * product name, description, and SDK list changes.
 *
 * Local usage: npx tsx scripts/seed-legal-docs.ts
 * Runtime container usage: node dist-seed/scripts/seed-legal-docs.js
 *
 * Safety: This script is idempotent — it will upsert documents.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Laicai content: read from infinex-site HTML files
// ---------------------------------------------------------------------------

const INFINEX_SITE_BASE = path.resolve(
  process.env.JOYA_ROOT || "/Users/joya/JoyaProjects",
  "infinex-site",
);

function readLaicaiDocument(filename: string): string {
  const filePath = path.join(INFINEX_SITE_BASE, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Laicai document not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// InfoV variants: adapt Laicai templates
// ---------------------------------------------------------------------------

function createInfoVUserAgreement(laicaiHtml: string): { title: string; contentHtml: string; version: string } {
  let html = laicaiHtml;

  // Replace title
  html = html.replace(/来财 App 用户协议/g, "家信柜（InfoV）用户协议");
  html = html.replace(/<title>来财 App 用户协议<\/title>/, "<title>家信柜（InfoV）用户协议</title>");

  // Replace product description
  html = html.replace(
    /"来财"是一款以邻里为本的闲置共享与社区互助平台应用软件（以下简称"本软件"或"本平台"）/,
    '"家信柜（InfoV）"是一款以家庭为单位的信息安全归档与家庭资料管理应用软件（以下简称"本软件"或"本平台"）',
  );

  // Replace product name throughout
  html = html.replace(/"来财"/g, '"家信柜（InfoV）"');
  html = html.replace(/来财/g, "家信柜（InfoV）");

  // Replace feature-specific references
  html = html.replace(
    /人情分/g, "家庭档案",
  );
  html = html.replace(
    /闲置物品共享和邻里互助的信息匹配服务/g,
    "家庭信息安全归档、家庭资料管理和家庭成员间协作服务",
  );
  html = html.replace(
    /发布的需求或供给内容，包括标题、描述、分类、价格、图片等/g,
    "上传的家庭文档、照片、音视频等资料内容",
  );
  html = html.replace(
    /交易订单的详情，包括订单状态、交易金额、配送方式、服务地址等/g,
    "归档文件的管理记录，包括文件状态、归档时间、访问权限等",
  );
  html = html.replace(
    /人情分账户余额、收支记录，用于平台内的积分交易/g,
    "家庭档案的存储空间使用情况、文件统计",
  );
  html = html.replace(
    /您与其他用户之间的消息内容，用于提供即时通讯服务/g,
    "家庭成员之间的消息内容，用于提供家庭协作通讯服务",
  );
  html = html.replace(
    /线下交易、面交、租赁或提供劳务互助等行为，系用户双方的自主行为/g,
    "家庭资料的共享、下载、协作编辑等行为，系家庭成员的自主行为",
  );
  html = html.replace(
    /附近的需求和供给信息、市场定位/g,
    "家庭成员信息、文件归档状态",
  );
  html = html.replace(
    /确认物品真实状况及对方身份/g,
    "确认资料完整性和访问权限设置",
  );
  html = html.replace(
    /posts、图片、报价、私聊内容/g,
    "文档、照片、备注、协作消息",
  );
  html = html.replace(
    /个人中心/g, "设置",
  );
  html = html.replace(
    /【我的 - 设置[\s-]*\n?\s*注销账号】/g,
    "【设置 - 账号与安全 - 注销账号】",
  );
  html = html.replace(
    /虚拟资产（如人情分）、发布记录、对话记录/g,
    "家庭档案、归档文件、协作记录",
  );

  // Version
  html = html.replace(/v1\.0\.0\+20/g, "v1.0.1+27");

  // ICP: keep same company, change suffix
  html = html.replace(/陕ICP备2026002096号-1/g, "陕ICP备2026002096号-2");

  // Update date
  html = html.replace(/2026年2月22日/g, "2026年4月26日");

  return {
    title: "家信柜（InfoV）用户协议",
    contentHtml: html,
    version: "v1.0.1+27",
  };
}

function createInfoVPrivacyPolicy(laicaiHtml: string): { title: string; contentHtml: string; version: string } {
  let html = laicaiHtml;

  // Replace title
  html = html.replace(/来财 App 隐私政策/g, "家信柜（InfoV）隐私政策");
  html = html.replace(/<title>来财 App 隐私政策<\/title>/, "<title>家信柜（InfoV）隐私政策</title>");

  // Replace product name
  html = html.replace(/"来财"/g, '"家信柜（InfoV）"');
  html = html.replace(/来财/g, "家信柜（InfoV）");

  // Replace core description
  html = html.replace(
    /账号注册、身份验证、信息发布、订单交易、即时通讯、地图定位等基本功能/g,
    "账号注册、身份验证、家庭信息归档、文件管理、家庭成员协作等基本功能",
  );

  // Remove Baidu Maps references
  html = html.replace(
    /本应用基于地理位置提供本地化服务（如附近的需求和供给信息、市场定位），需要获取您的位置信息。我们使用百度地图 SDK\s*提供地图和定位服务。您可以在系统设置中随时关闭位置权限。/g,
    "本应用为家庭信息安全归档工具，提供家庭文档管理、家庭成员协作等核心功能。您可以在系统设置中管理各项权限。",
  );

  // Replace data collection sections
  html = html.replace(
    /发布信息：.*?价格、图片等。/gs,
    "归档信息：您上传的家庭文档、照片、音视频等资料，包括标题、描述、分类、标签等。",
  );
  html = html.replace(
    /订单信息：.*?服务地址等。/gs,
    "文件管理记录：归档文件的详情，包括文件状态、归档时间、访问权限等。",
  );
  html = html.replace(
    /人情分记录：.*?用于平台内的积分交易。/gs,
    "存储使用记录：您的存储空间使用情况、文件统计信息，用于存储空间管理。",
  );

  // Replace SDK tables with InfoV-relevant SDKs
  html = html.replace(
    /<h4 style="margin: 20px 0 10px; color: #9CA3AF;">Android 平台 SDK<\/h4>[\s\S]*?<\/table>/,
    `<h4 style="margin: 20px 0 10px; color: #9CA3AF;">Android 平台 SDK</h4>
            <table>
                <tr>
                    <th>SDK 名称</th>
                    <th>开发者</th>
                    <th>使用目的</th>
                    <th>收集信息范围</th>
                    <th>隐私政策</th>
                </tr>
                <tr>
                    <td>Flutter 设备信息插件（device_info_plus）</td>
                    <td>Flutter Community（开源社区）</td>
                    <td>获取设备型号、系统版本等基础信息，用于服务兼容性判断和体验优化</td>
                    <td>设备型号、设备品牌、操作系统版本、SDK 版本号</td>
                    <td><a href="https://pub.dev/packages/device_info_plus" target="_blank" style="color: #F6C861;">查看</a></td>
                </tr>
                <tr>
                    <td>flutter_secure_storage</td>
                    <td>Flutter Community（开源社区）</td>
                    <td>安全存储用户敏感数据（如认证令牌），使用平台原生安全存储机制</td>
                    <td>不收集额外个人信息，仅提供加密存储能力</td>
                    <td><a href="https://pub.dev/packages/flutter_secure_storage" target="_blank" style="color: #F6C861;">查看</a></td>
                </tr>
                <tr>
                    <td>sqflite</td>
                    <td>Flutter Community（开源社区）</td>
                    <td>本地数据库存储，用于离线缓存家庭归档数据</td>
                    <td>不收集额外个人信息，仅提供本地数据库能力</td>
                    <td><a href="https://pub.dev/packages/sqflite" target="_blank" style="color: #F6C861;">查看</a></td>
                </tr>
            </table>`,
  );

  // Replace iOS SDK table
  html = html.replace(
    /<h4 style="margin: 20px 0 10px; color: #9CA3AF;">iOS 平台 SDK<\/h4>[\s\S]*?<\/table>/,
    `<h4 style="margin: 20px 0 10px; color: #9CA3AF;">iOS 平台 SDK</h4>
            <table>
                <tr>
                    <th>SDK 名称</th>
                    <th>开发者</th>
                    <th>使用目的</th>
                    <th>收集信息范围</th>
                    <th>隐私政策</th>
                </tr>
                <tr>
                    <td>Flutter 设备信息插件（device_info_plus）</td>
                    <td>Flutter Community（开源社区）</td>
                    <td>获取设备型号、系统版本等基础信息，用于服务兼容性判断和体验优化</td>
                    <td>设备型号、设备品牌、操作系统版本</td>
                    <td><a href="https://pub.dev/packages/device_info_plus" target="_blank" style="color: #F6C861;">查看</a></td>
                </tr>
                <tr>
                    <td>flutter_secure_storage</td>
                    <td>Flutter Community（开源社区）</td>
                    <td>安全存储用户敏感数据（如认证令牌），使用 Keychain 安全存储</td>
                    <td>不收集额外个人信息，仅提供加密存储能力</td>
                    <td><a href="https://pub.dev/packages/flutter_secure_storage" target="_blank" style="color: #F6C861;">查看</a></td>
                </tr>
                <tr>
                    <td>sqflite</td>
                    <td>Flutter Community（开源社区）</td>
                    <td>本地数据库存储，用于离线缓存家庭归档数据</td>
                    <td>不收集额外个人信息，仅提供本地数据库能力</td>
                    <td><a href="https://pub.dev/packages/sqflite" target="_blank" style="color: #F6C861;">查看</a></td>
                </tr>
            </table>`,
  );

  // Replace shared SDK table - remove Tencent CloudBase, add SRS
  html = html.replace(
    /<h4 style="margin: 20px 0 10px; color: #9CA3AF;">双平台共用 SDK<\/h4>[\s\S]*?<\/table>/,
    `<h4 style="margin: 20px 0 10px; color: #9CA3AF;">双平台共用 SDK</h4>
            <table>
                <tr>
                    <th>SDK 名称</th>
                    <th>开发者</th>
                    <th>使用目的</th>
                    <th>收集信息范围</th>
                    <th>隐私政策</th>
                </tr>
                <tr>
                    <td>Shared Runtime Services (SRS)</td>
                    <td>无尽探索（西安）科技有限公司</td>
                    <td>提供后端 API 服务，包括用户认证、文件存储、版本更新等</td>
                    <td>上传的文件和数据、设备信息</td>
                    <td>内部服务</td>
                </tr>
            </table>`,
  );

  // Remove Baidu maps MAC address mentions
  html = html.replace(
    /<strong>设备 MAC 地址：<\/strong>百度地图 SDK 和百度定位 SDK 在提供定位和地图服务时，可能会读取设备的 MAC\s*地址，用于辅助定位精度和网络环境判断。<strong>该信息仅在您同意隐私政策并使用地图\/定位相关功能时才会被收集。<\/strong>/g,
    "",
  );

  // Remove GeTui software install list mentions
  html = html.replace(
    /<strong>软件安装列表：<\/strong>个推（GeTui）消息推送 SDK\s*在建立推送通道时，可能会收集设备上的部分已安装应用信息，用于智能推送通道选择和推送成功率优化。<strong>该信息仅在您同意隐私政策后才会被收集，且不会用于任何广告投放或用户画像目的。<\/strong>/g,
    "",
  );

  // Remove GeTui push notification references
  html = html.replace(
    /我们使用个推 \(GeTui\) 推送服务向您发送订单状态变更、新消息等通知。/g,
    "我们通过应用内通知方式向您发送系统通知、版本更新提醒等。",
  );
  html = html.replace(
    /推送通知：我们使用个推 \(GeTui\) 推送服务向您发送订单状态变更、新消息等通知。/g,
    "推送通知：我们通过应用内通知方式向您发送系统通知、版本更新提醒等。",
  );

  // Remove mentions of 实名认证 related to face recognition
  html = html.replace(
    /<strong>实名认证信息：<\/strong>当您选择进行实名认证时，我们会收集您的真实姓名及身份证号码，用于身份核验，提升交易信任度。/g,
    "",
  );

  // Update device info section to remove Baidu/GeTui specific items
  html = html.replace(
    /位置信息、<strong>设备MAC地址<\/strong>、设备信息、网络信息/g,
    "设备信息、网络信息",
  );

  // Update the note at the bottom of SDK tables
  html = html.replace(
    /注：上述第三方 SDK 仅在用户同意本隐私政策后方可收集和使用相关信息。iOS\s*平台上的设备标识信息为 IDFA\/IDFV，Android 平台上为 OAID。各 SDK 收集使用个人信息的详细规则，请参阅各 SDK 的隐私政策。/g,
    "注：上述第三方 SDK 仅在用户同意本隐私政策后方可收集和使用相关信息。各 SDK 收集使用个人信息的详细规则，请参阅各 SDK 的隐私政策。",
  );

  // Update storage provider reference
  html = html.replace(
    /您的个人信息存储在中华人民共和国境内的服务器上（腾讯云）/g,
    "您的个人信息存储在中华人民共和国境内的服务器上",
  );

  // Update access rights references
  html = html.replace(
    /"个人中心"/g,
    '"设置"',
  );

  // Update contact center reference
  html = html.replace(
    /平台内的"反馈中心"/g,
    '应用内的"反馈"功能',
  );

  // Version
  html = html.replace(/v1\.0\.0\+20/g, "v1.0.1+27");

  // ICP
  html = html.replace(/陕ICP备2026002096号-1/g, "陕ICP备2026002096号-2");

  // Update date
  html = html.replace(/2026年2月22日/g, "2026年4月26日");

  // Clean up any empty list items left by replacements
  html = html.replace(/<li>\s*<\/li>/g, "");

  return {
    title: "家信柜（InfoV）隐私政策",
    contentHtml: html,
    version: "v1.0.1+27",
  };
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding legal documents...");

  // Read Laicai source documents
  const laicaiUserAgreement = readLaicaiDocument("user-agreement.html");
  const laicaiPrivacyPolicy = readLaicaiDocument("privacy-policy.html");

  // Seed Laicai documents (use original content)
  const laicaiDocs = [
    {
      projectKey: "laicai",
      documentType: "user_agreement",
      title: "来财 App 用户协议",
      contentHtml: laicaiUserAgreement,
      version: "v1.0.0+20",
    },
    {
      projectKey: "laicai",
      documentType: "privacy_policy",
      title: "来财 App 隐私政策",
      contentHtml: laicaiPrivacyPolicy,
      version: "v1.0.0+20",
    },
  ];

  // Generate InfoV variants
  const infovUserAgreement = createInfoVUserAgreement(laicaiUserAgreement);
  const infovPrivacyPolicy = createInfoVPrivacyPolicy(laicaiPrivacyPolicy);

  const infovDocs = [
    {
      projectKey: "infov",
      documentType: "user_agreement",
      title: infovUserAgreement.title,
      contentHtml: infovUserAgreement.contentHtml,
      version: infovUserAgreement.version,
    },
    {
      projectKey: "infov",
      documentType: "privacy_policy",
      title: infovPrivacyPolicy.title,
      contentHtml: infovPrivacyPolicy.contentHtml,
      version: infovPrivacyPolicy.version,
    },
  ];

  // Upsert all documents
  for (const doc of [...laicaiDocs, ...infovDocs]) {
    const result = await prisma.legalDocument.upsert({
      where: {
        projectKey_documentType: {
          projectKey: doc.projectKey,
          documentType: doc.documentType,
        },
      },
      create: doc,
      update: {
        title: doc.title,
        contentHtml: doc.contentHtml,
        version: doc.version,
      },
    });
    console.log(`  Upserted: ${doc.projectKey}/${doc.documentType} (id: ${result.id})`);
  }

  console.log("Legal document seeding complete.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
