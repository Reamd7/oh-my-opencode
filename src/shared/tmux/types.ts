/**
 * Tmux pane 创建结果
 * 
 * @property success - 是否成功创建 pane
 * @property paneId - Tmux pane ID（格式如 "%42"），仅在成功时返回
 */
export interface SpawnPaneResult {
  success: boolean
  paneId?: string
}
