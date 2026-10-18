import { finding, type Check } from '../check';

/** Content が出した誤り・警告（L0）。ファイルの場所からエリアのノードに結びつける */
export default {
  id: 'content_issue',
  run({ src }) {
    return src.issues.map((issue) => {
      const area = /\/content\/areas\/([^/]+)\//.exec(issue.file)?.[1];
      return finding('content_issue', issue.level === 'error' ? 'red' : 'yellow', {
        nodes: area && src.areas.has(area) ? [`area:${area}`] : [],
        subject: `${issue.file}:${issue.message}`,
        text: `${issue.file}: ${issue.message}`,
      });
    });
  },
} satisfies Check;
