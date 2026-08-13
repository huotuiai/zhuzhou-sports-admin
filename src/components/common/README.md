# 公共 CRUD 组件

本目录只封装后台列表页的通用交互，不包含字段、校验、接口、状态文案或业务权限。业务模块通过 `props`、`emits` 和插槽组合使用。

## 组件职责

- `QueryPanel`：语义化查询表单、查询/重置按钮、加载与禁用状态；查询字段由默认插槽提供。
- `DataTable<TRow>`：泛型列配置、稳定行键、加载/空状态和横向滚动；业务展示通过 `cell-{key}` 插槽提供。
- `PaginationBar`：受控页码、每页条数和总数；数据切片仍由 Store 或接口完成。
- `CrudDialog`：受控新增/编辑弹窗、保存状态和关闭意图；业务字段及校验由插槽组件完成。

## 组合示例

```vue
<QueryPanel @query="search" @reset="reset">
  <!-- 业务查询字段 -->
</QueryPanel>

<DataTable
  :columns="columns"
  :rows="rows"
  row-key="id"
>
  <template #cell-status="{ row }">
    <!-- 业务状态展示 -->
  </template>
</DataTable>

<PaginationBar
  :page="page"
  :page-size="pageSize"
  :total="total"
  @update:page="setPage"
  @update:page-size="setPageSize"
/>

<CrudDialog
  :open="dialogOpen"
  :mode="dialogMode"
  :dirty="dirty"
  @submit="save"
  @request-close="confirmBeforeClose"
>
  <!-- 纯业务字段组件，不要在这里再嵌套 form 或底部保存按钮 -->
</CrudDialog>
```

类型契约统一从 `@/components/common` 导入。新增业务模块时禁止在公共组件中加入模块名称、字段判断或 Storage/API 调用。
