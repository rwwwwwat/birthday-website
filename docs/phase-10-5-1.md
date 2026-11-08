# 第10.5.1阶段：权限加固进度保存

保存时间：2026-11-01 16:11（本机时间）。用户准备关机，明确要求保存进度后停止。

**当前为暂停交接记录，不是最终交付或人工验收通过声明。** 修改和测试结果已经保存到磁盘；未创建Git提交，未进入10.6。

## 已完成的修改

仅修改以下两个既有文件：

1. `database/postgresql/003_grant_runtime_permissions.sql`
2. `backend/BirthdayWebsite.Api.Tests/scripts/postgres-script-check.mjs`

本文件为本阶段新增文档。其余受保护文件与本阶段开始时哈希对比无变化。

003已改为先拒绝风险、后授予白名单：

- 检查LOGIN及SUPERUSER、BYPASSRLS、CREATEROLE、CREATEDB、REPLICATION。
- 拒绝任何方向的角色成员关系及该角色作为grantor的关系，不依赖NOINHERIT；覆盖继承、间接路径和SET ROLE。
- 用pg_shdepend检查所有权，包括表、schema、Identity序列、辅助函数、数据库及其他对象。
- 检查未审查的角色登录设置、目标Identity/辅助函数定义、触发器/规则及RLS状态。
- 通过aclexplode/acldefault检查直接ACL与PUBLIC默认ACL，包括数据库、schema、表/列、序列、函数、类型、表空间、外部服务器/包装器、参数、大对象及默认授权。
- 拒绝额外权限、GRANT OPTION、其他可连接数据库的授权及危险大对象/文件函数访问；错误说明角色、权限及对象。
- 不自动REVOKE、不更改成员关系、不修复已有环境；检查成功后仅GRANT CONNECT、schema USAGE、必要函数EXECUTE、表SELECT/INSERT、列UPDATE(is_read)、序列USAGE。
- 授权后再用has_*_privilege检查有效权限。标准系统SQL/元数据仍可用，含pg_settings的正常会话设置能力；这不是SQL语句防火墙。
- 这是授权时点检查，不能阻止后续DBA变更；真实Supabase环境仍需独立审查。

## 已完成测试

最终一次PGlite运行进程已正常结束，退出0，没有遗留该测试进程。

| 项目 | 当前实际结果 |
| --- | --- |
| 原PGlite检查 | 7组全部通过，原断言保留 |
| 新权限场景A至H | 42个子用例全部通过，每个使用独立新内存实例 |
| 后端测试 | 232通过、0失败、0跳过 |
| 后端编译 | 0警告、0错误 |
| 前端测试 | 69通过、0失败 |
| 前端构建 | 成功，私人媒体产物检查通过 |

新权限用例数量：A=1、B=2、C=2、D=12、E=5、F=7、G=12、H=1。

- A/H实际执行SELECT、INSERT/RETURNING、UPDATE(is_read)、辅助函数和nextval；正文/来源/时间/ID修改、DELETE、TRUNCATE、CREATE、公有schema建表、临时表、ALTER/DROP、重置序列及SET ROLE postgres均按42501拒绝。
- B验证直接与间接继承；C验证NOINHERIT但SET TRUE，以及其他账号取得运行身份的入向成员关系。
- D验证已有直接ACL及GRANT OPTION；E验证表/schema/Identity序列/函数/数据库Owner；F验证高权限属性及未审查的登录配置；G验证PUBLIC授权及额外RLS环境；H验证合法旧ACL及重复审计。
- 拒绝用例比较前后ACL和成员关系，确认脚本没有擅自撤销或更改已有授权。
- Identity序列Owner会跟随表Owner，E中的序列用例按真实PostgreSQL所有权规则验证，并非伪造独立序列所有者。

## PGlite兼容问题与已采取方式

旧PGlite0.3.14的数据库级GRANT/REVOKE出现XX000 tuple concurrently deleted，不能用于这一轮完整权限测试。已在独立且被Git忽略的`.local/phase10-5-1-pgcheck`安装PGlite **0.5.12**，没有安装系统数据库服务，没有改变前后端依赖。

指定测试脚本改用0.5.12。原7组检查仍执行且通过，产品门禁没有为旧引擎错误放宽。最终测试没有修改pg_database目录数据；早期诊断仅发生于已经销毁的独立内存实例。

新干净角色测试显式由内存实例的管理员准备干净PUBLIC环境：撤销测试实例中默认TEMP、非目标数据库CONNECT、public schema使用及危险大对象函数等额外默认能力，保留当前数据库CONNECT。该准备仅属于测试夹具，生产003不包含这些REVOKE。生产默认PUBLIC权限若不符合要求，003会拒绝，不能自动整理真实Supabase环境。

SET ROLE反例需要正确区分current_user与session_user。新测试用SET SESSION AUTHORIZATION模拟运行会话，再验证SET ROLE。PGlite的RESET SESSION AUTHORIZATION保留变更后的默认值，因此测试完成后显式恢复原测试管理员；不影响真实产品认证，也不证明TCP登录验证已完成。

## 保存的证据及复现

- `.local/phase10-5-1-before.json`：本阶段开始时文件哈希。
- `.local/phase10-5-1-003-before.sql`：原003脚本副本，可用于生成最终差异。
- `.local/phase10-5-1-postgres-script-result.json`：最终7组及42个子用例结果。
- `.local/phase10-5-1-pglite-output.log`：最终完整测试输出。
- `.local/phase10-5-1-pglite-error.log`：最终运行无失败输出。
- `.local/phase10-5-1-artifacts/`：本阶段独立后端测试及编译产物。

复现命令：

```powershell
cd F:\ourweb
node backend/BirthdayWebsite.Api.Tests/scripts/postgres-script-check.mjs
dotnet test BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-5-1-artifacts -p:UseAppHost=false
dotnet build BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-5-1-artifacts --no-restore -p:UseAppHost=false
cd frontend
npm test
npm run build
```

## 保护边界

没有连接SQL Server或Supabase，没有读取真实WishId=1，没有修改真实数据或真实角色，没有真实权限修改、迁移、上传、云资源创建或部署。

原SQL Server实现及建库脚本、PostgreSQL001/002、管理员/Access/CSRF代码、前端产品源码、音乐、照片、封面均未修改。

原SQL Server建库脚本SHA-256仍为`34655B75A410188E8BA298B0054709CB034B8FD7847C7B5F359BD75EA9279DDB`。

## 下次接续点

1. 先阅读本文件及最终PGlite结果，不重复开发、不重新执行真实数据库操作。
2. 做最终代码审阅，核对权限白名单、系统默认权限例外及失败保护是否完整；如发现问题，仍只在当前获准文件范围内处理。
3. 将本进度记录完善为用户要求的正式报告：完整变更说明、八组实测结果、保护哈希及当前真实Supabase限制。
4. 明确区分：PGlite权限已通过；Npgsql真实网络尚未验证；Supabase真实角色尚未配置。
5. 交付后停止，等待人工审查，不开始10.6。

用户要求暂停优先：本次保存完成后不继续推进。
