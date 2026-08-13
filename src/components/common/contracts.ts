export type DataTableAlign = 'left' | 'center' | 'right'

export type DataTableRowKey<TRow> = keyof TRow | ((row: TRow, rowIndex: number) => PropertyKey)

export interface DataTableColumn<TRow> {
  /** Stable identifier, also used by the `cell-{key}` and `header-{key}` slots. */
  key: string
  label: string
  accessor?: keyof TRow | ((row: TRow, rowIndex: number) => unknown)
  align?: DataTableAlign
  width?: string
  minWidth?: string
  headerClass?: string
  cellClass?: string
}

export interface DataTableCellSlotProps<TRow> {
  row: TRow
  rowIndex: number
  column: DataTableColumn<TRow>
  value: unknown
}

export interface DataTableHeaderSlotProps<TRow> {
  column: DataTableColumn<TRow>
}

export type CrudDialogMode = 'create' | 'edit'

export type CrudDialogCloseReason = 'cancel' | 'close-button' | 'escape' | 'outside'

export interface CrudDialogCloseRequest {
  reason: CrudDialogCloseReason
  dirty: boolean
}
