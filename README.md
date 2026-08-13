# 株洲体育中心智慧管理平台

基于 Vue 3、TypeScript、Vite、Pinia、Vue Router、Tailwind CSS v4 与 shadcn-vue 的政务后台模板。

平台仅支持 PC 端，浏览器视口宽度需达到 `1024px`；更窄的窗口不会挂载业务页面或地图 SDK。

## 开发命令

```bash
npm install
npm run dev
```

## 质量检查

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

## 区域管制地图

1. 复制 `.env.example` 为 `.env.local`，配置高德 Web 端 JS API 2.0 Key。
2. 开发环境配置 `VITE_AMAP_SECURITY_JS_CODE`；生产环境建议使用 `VITE_AMAP_SERVICE_HOST` 安全代理。
3. 未配置 Key 时，页面会显示明确的地图错误态，已保存的本地区域仍可只读查看。

管制区域以 `GCJ-02` 坐标存入 localStorage，存储 Key 为 `zz-sports-control-zones:v1`。正式投产前，请确认高德技术服务许可、生产域名白名单及公网访问策略。

## 演示账号

- 账号：`admin`
- 密码：`123456`
- 图形验证码：以登录页当前显示内容为准，不区分大小写

登录认证为前端模拟，认证服务位于 `src/services/auth.ts`，后续可替换为真实接口实现。模板不预设任何业务模块或数据模型。

## 公共 CRUD 组件

`src/components/common` 提供与业务无关的 `QueryPanel`、`DataTable`、`PaginationBar` 和 `CrudDialog`。停车场管理是首个接入样例；字段、校验和存储仍保留在对应业务模块中。
