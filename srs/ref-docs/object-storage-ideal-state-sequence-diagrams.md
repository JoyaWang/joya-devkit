# SRS 理想状态：私有对象与公共对象上传/下载时序图

> 仅描述理想状态。  
> 私有对象 = `private-signed` / `internal-signed`；公共对象 = `public-stable`。  
> 业务项目统一只调用 SRS API；底层 provider / bucket / CDN 细节对业务侧透明。
>
> ## 域名使用原则（理想状态）
> - **公共对象下载**：必须通过稳定公共入口域名（例如 `dl-dev` / `dl` 或等价域名）对外暴露，保证用户侧链接合同稳定。
> - **私有/内部对象下载**：不使用稳定公共入口域名；默认返回签名下载 URL。可按 provider plane 需要配置下载域名（例如 `origin-dev` / `origin` 或等价域名），但这属于底层实现选择，不属于用户侧稳定公共合同。
> - **所有对象上传**：都不要求通过稳定公共入口域名；业务方统一通过 SRS 申请上传签名后，直传到底层 provider。
> - **核心分层**：`dl-dev` / `dl` 代表 delivery plane；`origin-dev` / `origin` 或 provider 默认 host 代表 provider plane；两层职责必须分离，避免 redirect loop 与合同漂移。

## 术语说明

- **delivery plane**：面向用户或外部调用方的稳定分发入口层。典型表现为 `dl-dev` / `dl` 这类长期稳定域名。它负责稳定链接合同，不直接等同于底层存储桶。
- **provider plane**：真实对象存储访问层。它负责上传签名、下载签名、对象存在性检查、删除等实际存储动作；可表现为 provider 默认 host，或 `origin-dev` / `origin` 这类下载域名。
- **public-stable**：公共稳定访问级别。适用于 APK、桌面安装包、未来公共媒体等需要长期稳定外链的对象。下载时必须通过稳定公共入口合同暴露。
- **private-signed**：私有签名访问级别。适用于头像、附件、私有文档等对象。下载时通过受控 API 申请临时签名 URL，不对外暴露稳定公共入口。
- **internal-signed**：内部签名访问级别。适用于日志、归档、审计产物等内部对象。下载方式与私有对象类似，但权限边界更严格。
- **binding**：`projectKey + runtimeEnv + serviceType` 对应的一条项目服务绑定记录。它决定当前请求实际使用哪个 provider、bucket、region、凭证与下载域名，是运行时真相源。
- **objectKey**：对象在逻辑层的统一键，例如 `{project}/{env}/{domain}/{scope}/{entityId}/{fileKind}/{yyyy}/{mm}/{uuid}-{filename}`。项目隔离、环境隔离、对象语义和迁移能力都围绕它展开。
- **objectProfile**：对象的业务画像，例如 `release_artifact`、`private_media`、`internal_archive`。它帮助策略层推导访问方式和交付方式。
- **accessClass**：对象访问级别，例如 `public-stable`、`private-signed`、`internal-signed`。它决定对象最终是走稳定公共入口还是签名下载。

## 1. 私有对象上传（理想状态）

```mermaid
sequenceDiagram
    autonumber
    participant Biz as 业务项目后端 / App 服务
    participant ObjAPI as SRS Object API
    participant Policy as 策略层
    participant Resolver as ProjectContextResolver
    participant Factory as AdapterFactory
    participant MetaDB as 元数据数据库
    participant Provider as Provider Plane（共享或专用存储）

    Biz->>ObjAPI: POST /v1/objects/upload-requests\nproject/env/domain/scope/entityId/fileKind/fileName/contentType/size/checksum/purpose
    ObjAPI->>ObjAPI: 校验 service token\n取 projectKey + runtimeEnv 作为真相源
    ObjAPI->>ObjAPI: 校验 body.project / body.env 一致\n校验 scope / domain 合法
    ObjAPI->>Policy: deriveDefaultPolicy(domain, scope, fileKind, contentType)
    Policy-->>ObjAPI: objectProfile=private_media/private_document/internal_archive\naccessClass=private-signed 或 internal-signed
    ObjAPI->>Resolver: resolve(projectKey, runtimeEnv, object_storage)
    Resolver-->>ObjAPI: binding(provider,bucket,region,downloadDomain,...)
    ObjAPI->>Factory: getOrCreate(binding)
    Factory-->>ObjAPI: provider-neutral adapter
    ObjAPI->>Provider: createUploadRequest(objectKey, contentType, size, checksum)
    Provider-->>ObjAPI: uploadUrl + requiredHeaders + expiresAt
    ObjAPI->>MetaDB: 写 objects(status=pending_upload, accessClass=private/internal)\n写审计日志
    MetaDB-->>ObjAPI: ok
    ObjAPI-->>Biz: objectKey + uploadUrl + requiredHeaders + expiresAt

    Note over Biz,Provider: 业务侧只拿上传签名直传，不感知底层是共享桶还是专用桶

    Biz->>Provider: PUT 文件到 uploadUrl
    Provider-->>Biz: 200 / 204

    Biz->>ObjAPI: POST /v1/objects/complete\nobjectKey / size / checksum
    ObjAPI->>Resolver: resolve(projectKey, runtimeEnv, object_storage)
    Resolver-->>ObjAPI: current binding
    ObjAPI->>Factory: getOrCreate(binding)
    Factory-->>ObjAPI: adapter
    ObjAPI->>MetaDB: 读取 object 元数据
    MetaDB-->>ObjAPI: object(status=pending_upload)
    ObjAPI->>Provider: headObject(objectKey)
    Provider-->>ObjAPI: exists + metadata
    ObjAPI->>MetaDB: 更新 objects(status=active)\n写 objectStorageLocation(primary)\n如存在迁移任务则补 replica=pending_backfill\n写审计日志
    MetaDB-->>ObjAPI: ok
    ObjAPI-->>Biz: { objectKey, status=active }
```

## 2. 私有对象下载（理想状态）

```mermaid
sequenceDiagram
    autonumber
    participant Biz as 业务项目后端 / App 服务
    participant ObjAPI as SRS Object API
    participant MetaDB as 元数据数据库
    participant Resolver as Read Location Resolver
    participant Ctx as ProjectContextResolver
    participant Factory as AdapterFactory
    participant Provider as Provider Plane（共享或专用存储）

    Biz->>ObjAPI: POST /v1/objects/download-requests\nobjectKey
    ObjAPI->>ObjAPI: 校验 service token\n取 projectKey + runtimeEnv
    ObjAPI->>MetaDB: 按 objectKey 查询 object
    MetaDB-->>ObjAPI: object(projectKey, env, status, accessClass, objectProfile)
    ObjAPI->>ObjAPI: 校验对象属于当前项目\n校验 env 一致\n校验对象状态为 active\n校验 accessClass 为 private-signed/internal-signed

    ObjAPI->>Resolver: resolveCandidateReadBindings(object, currentBinding, locations)
    Resolver->>MetaDB: 读取 objectStorageLocation(primary/replica/fallback)
    MetaDB-->>Resolver: location candidates
    Resolver->>Ctx: resolve(projectKey, runtimeEnv, object_storage)
    Ctx-->>Resolver: current binding
    Resolver-->>ObjAPI: candidateBindings（按主读/副本/fallback 顺序）

    loop 依候选 binding 逐个尝试
        ObjAPI->>Factory: getOrCreate(candidateBinding)
        Factory-->>ObjAPI: adapter
        ObjAPI->>Provider: headObject(objectKey)
        Provider-->>ObjAPI: exists? / metadata
    end

    ObjAPI->>Provider: createDownloadRequest(objectKey)
    Note over ObjAPI,Provider: 返回 provider-plane 下载 URL\n可使用 origin-dev / origin 或等价下载域名\n但不使用 dl-dev / dl 这类稳定公共入口
    Provider-->>ObjAPI: signed downloadUrl + expiresAt
    ObjAPI->>MetaDB: 写审计日志
    MetaDB-->>ObjAPI: ok
    ObjAPI-->>Biz: downloadUrl + expiresAt

    Biz->>Provider: GET signed downloadUrl
    Provider-->>Biz: 文件字节流
```

## 3. 公共对象上传（理想状态）

```mermaid
sequenceDiagram
    autonumber
    participant Biz as 业务项目后端 / CI / App 服务
    participant ObjAPI as SRS Object API
    participant Policy as 策略层
    participant Resolver as ProjectContextResolver
    participant Factory as AdapterFactory
    participant MetaDB as 元数据数据库
    participant Provider as Provider Plane（共享公共存储）
    participant Release as SRS Release Service（可选）

    Biz->>ObjAPI: POST /v1/objects/upload-requests\nproject/env/domain/scope/entityId/fileKind/fileName/contentType/size/checksum/purpose
    ObjAPI->>ObjAPI: 校验 service token\n取 projectKey + runtimeEnv 作为真相源
    ObjAPI->>ObjAPI: 校验 body.project / body.env 一致\n校验 scope / domain 合法
    ObjAPI->>Policy: deriveDefaultPolicy(domain, scope, fileKind, contentType)
    Policy-->>ObjAPI: objectProfile=release_artifact/public_media/public_asset\naccessClass=public-stable
    ObjAPI->>Resolver: resolve(projectKey, runtimeEnv, object_storage)
    Resolver-->>ObjAPI: binding(provider,bucket,region,downloadDomain,...)
    ObjAPI->>Factory: getOrCreate(binding)
    Factory-->>ObjAPI: provider-neutral adapter
    ObjAPI->>Provider: createUploadRequest(objectKey, contentType, size, checksum)
    Provider-->>ObjAPI: uploadUrl + requiredHeaders + expiresAt
    ObjAPI->>MetaDB: 写 objects(status=pending_upload, accessClass=public-stable)\n写审计日志
    MetaDB-->>ObjAPI: ok
    ObjAPI-->>Biz: objectKey + uploadUrl + requiredHeaders + expiresAt

    Biz->>Provider: PUT 文件到 uploadUrl
    Provider-->>Biz: 200 / 204

    Biz->>ObjAPI: POST /v1/objects/complete\nobjectKey / size / checksum
    ObjAPI->>Resolver: resolve(projectKey, runtimeEnv, object_storage)
    Resolver-->>ObjAPI: current binding
    ObjAPI->>Factory: getOrCreate(binding)
    Factory-->>ObjAPI: adapter
    ObjAPI->>MetaDB: 读取 object 元数据
    MetaDB-->>ObjAPI: object(status=pending_upload, accessClass=public-stable)
    ObjAPI->>Provider: headObject(objectKey)
    Provider-->>ObjAPI: exists + metadata
    ObjAPI->>MetaDB: 更新 objects(status=active)\n写 objectStorageLocation(primary)\n如存在迁移任务则补 replica=pending_backfill\n写审计日志
    MetaDB-->>ObjAPI: ok
    ObjAPI-->>Biz: { objectKey, status=active }

    opt 场景 = 发布产物 / 需要公开分发合同
        Biz->>Release: POST /v1/releases 或等价发布登记 API\nartifactObjectKey + platform/env/version...
        Release->>Policy: resolveDeliveryPolicy(env, accessClass=public-stable, objectKey)
        Policy-->>Release: stable public URL contract
        Release->>MetaDB: 写 app_releases / public delivery contract / 审计日志
        MetaDB-->>Release: ok
        Release-->>Biz: distributionUrl（稳定公共入口）
    end
```

## 4. 公共对象下载（理想状态）

```mermaid
sequenceDiagram
    autonumber
    participant User as 用户 / App / 浏览器
    participant PublicDNS as 稳定公共入口域名（如 dl-dev / dl 或等价域名）
    participant Delivery as SRS Public Delivery
    participant MetaDB as 元数据数据库
    participant Resolver as Read Location Resolver
    participant Ctx as ProjectContextResolver
    participant Factory as AdapterFactory
    participant Provider as Provider Plane（共享公共存储）

    User->>PublicDNS: GET https://stable-public-domain/{objectKey}
    PublicDNS->>Delivery: 转发到 SRS public-delivery route

    Delivery->>Delivery: 校验 host 属于稳定公共入口\n校验 objectKey 格式
    Delivery->>MetaDB: 查询 object 元数据
    MetaDB-->>Delivery: object(projectKey, env, status, accessClass=public-stable)
    Delivery->>Delivery: 校验对象状态=active\n校验 accessClass=public-stable\n校验 host 与 env 匹配

    Delivery->>Resolver: resolveCandidateReadBindings(object, currentBinding, locations)
    Resolver->>MetaDB: 读取 objectStorageLocation(primary/replica/fallback)
    MetaDB-->>Resolver: location candidates
    Resolver->>Ctx: resolve(projectKey, env, object_storage)
    Ctx-->>Resolver: current binding
    Resolver-->>Delivery: candidateBindings（按主读/副本/fallback 顺序）

    loop 依候选 binding 逐个尝试
        Delivery->>Factory: getOrCreate(candidateBinding)
        Factory-->>Delivery: adapter
        Delivery->>Provider: headObject(objectKey)
        Provider-->>Delivery: exists? / metadata
    end

    Delivery->>Provider: createDownloadRequest(objectKey)
    Note over Delivery,Provider: 生成 provider-plane 真实下载 URL\n可使用 origin-dev / origin 或等价下载域名\n绝不能再次回指稳定公共入口，否则会形成 redirect loop
    Provider-->>Delivery: provider signed URL + expiresAt

    Delivery->>MetaDB: 写访问审计 / 分发日志（可选）
    MetaDB-->>Delivery: ok
    Delivery-->>User: HTTP 302 Location: provider signed URL

    User->>Provider: GET provider signed URL
    Provider-->>User: 文件字节流
```
