# 部署工作流预留

本阶段不启用任何 GitHub Actions，不上传、不部署。

后续确认远程仓库后增加 Pages 工作流：检出源码，在 frontend 中运行
`npm ci`、`npm run build`，仅上传 `frontend/dist`。
不上传 backend、原始 images、需求文档、本地配置或数据库备份。
