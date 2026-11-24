/**
 * One trace line per step, in the words a visitor would use. Shared by the
 * assistant panel and the live console on /boaz/.
 */
export function describeTrace(step, titleOf) {
  const sentence = (title) => String(title).charAt(0).toLowerCase() + String(title).slice(1);
  switch (step.type) {
    case 'inference':
      return step.label || `Looked through the page for ${step.terms?.join(' or ') || 'that'}`;
    case 'navigate':
      return `Scrolled to ${sentence(titleOf(step.capabilityId))}`;
    case 'query':
      return `Checked ${sentence(titleOf(step.capabilityId))}`;
    case 'action':
      return `Did this: ${sentence(titleOf(step.capabilityId))}`;
    case 'surface':
      return `Answered with a card: ${titleOf(step.capabilityId)}`;
    case 'confirmation':
      return step.approved ? 'You confirmed, so I went ahead' : 'You cancelled, so nothing changed';
    case 'error':
      return `That stopped: ${step.message}`;
    default:
      return null;
  }
}
