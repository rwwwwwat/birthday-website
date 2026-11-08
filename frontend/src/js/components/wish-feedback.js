import { validReceipt } from '../services/wishesApi.js';
export function feedbackView(kind, preview = false, state = {}) {
  if (preview) {
    const examples = {
      pending: { title: '整理信纸 · 动效预览', detail: '此预览不会发送网络请求。', icon: '✧' },
      success: { title: '送达样式预览', detail: '本次没有发送，愿望仍在草稿中。', icon: '✓' },
      unavailable: { title: '失败与重试样式', detail: '仅展示反馈风格，不触发投递。', icon: '♡' },
    };
    return examples[kind] || examples.pending;
  }
  if (kind === 'success') {
    if (state.httpStatus !== 201 || !validReceipt(state.receipt)) return { title: '提交结果暂时无法确认', detail: '尚未取得有效的保存回执，请先核实，不要重复提交。', icon: '♡' };
    return { title: '愿望信已经送达啦！', detail: '你的每一个小心愿，我都会认真收藏 ♡', icon: '✓' };
  }
  if (kind === 'submitting') return { title: '正在投递你的心愿……', detail: '请稍候，正在等待数据库确认保存。不要重复点击。', icon: '✧' };
  if (kind === 'unknown') return { title: '提交结果暂时无法确认', detail: state.message || '数据库可能已经保存，请联系站点所有者核实，不要立即重复提交。', icon: '♡' };
  if (kind === 'error') return { title: state.httpStatus === 429 ? '先让心愿稍等一小会儿' : state.requiresConfirmation ? '服务暂时不可用 · 需要核实' : '这次投递没有完成', detail: state.message || '请检查后再试，草稿已保留。', icon: '♡' };
  return { title: '把小心愿，轻轻放在这里。', detail: state.configured === false ? '投递地址尚未配置，本次不会发送。' : '点击投递后，等待服务器确认送达。', icon: '♡' };
}
