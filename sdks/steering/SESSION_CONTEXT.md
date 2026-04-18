# SESSION_CONTEXT: joya-flutter-kits

## 项目状态
- **阶段**: P0 基础设施
- **当前任务**: 1.1 项目骨架搭建

## 项目简介
Joya Flutter 公共能力包 monorepo。从 Laicai 提取版本更新、崩溃上报、错误上报、手动反馈、设备信息、日志系统等能力，做成独立 Flutter package。

## 关键决策
1. **多包 + monorepo**：用 melos 管理多个独立 Flutter package
2. **独立 Git repo**：joya-flutter-kits，不放在 SRS 或 joya-lib 中
3. **P0→P1→P2 顺序**：先建基础设施，再版本更新，再反馈上报
4. **暂不接入任何项目**：只建基座、验证能力可用

## 依赖来源
- 源码参考：`/Users/joya/JoyaProjects/Laicai/flutter/lib/`
- SRS 后端：`/Users/joya/JoyaProjects/shared-runtime-services/`（版本检查 API 已有）

## 立即行动项
1. 初始化 melos workspace + 7 个包的目录结构
2. 实现 joya_result
3. 实现 joya_auth
4. 实现 joya_http
5. 实现 joya_version_kit
6. 实现 joya_logger + joya_device + joya_feedback_kit
