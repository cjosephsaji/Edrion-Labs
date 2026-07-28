/**
 * Canonical Learn topic_key forms (hyperspec 1 §1.1 / DEC-14).
 *   topic:<learn_topic_id>   — when a real learn_topics row exists
 *   material:<material_id>   — library document / knowledge item
 *   free:<slug(title)>       — genuinely ad-hoc (null learn_topic_id on profiles)
 */

export function slugifyTopicTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'topic';
}

export function topicKeyForLearnTopic(learnTopicId: string): string {
  return `topic:${learnTopicId}`;
}

export function topicKeyForMaterial(materialId: string): string {
  return `material:${materialId}`;
}

export function topicKeyForFree(title: string): string {
  return `free:${slugifyTopicTitle(title)}`;
}

export function parseTopicKey(
  topicKey: string,
):
  | { kind: 'topic'; learnTopicId: string }
  | { kind: 'material'; materialId: string }
  | { kind: 'free'; slug: string }
  | { kind: 'other'; raw: string } {
  if (topicKey.startsWith('topic:')) {
    return { kind: 'topic', learnTopicId: topicKey.slice('topic:'.length) };
  }
  if (topicKey.startsWith('material:')) {
    return { kind: 'material', materialId: topicKey.slice('material:'.length) };
  }
  if (topicKey.startsWith('free:')) {
    return { kind: 'free', slug: topicKey.slice('free:'.length) };
  }
  return { kind: 'other', raw: topicKey };
}
