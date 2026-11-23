import { AppProvider } from './context/AppContext';
import FeedbackForm from './pages/FeedbackForm';
import InvalidFeedbackLink from './pages/InvalidFeedbackLink';
import './index.css';

/** Public, no-login student satisfaction form: /?view=feedback&taskId=<id> */
export default function PublicFeedback() {
  const taskId = new URLSearchParams(window.location.search).get('taskId')?.trim();
  const valid = !!taskId && taskId !== 'null' && taskId !== 'undefined';
  return <AppProvider>{valid ? <FeedbackForm taskId={taskId!} /> : <InvalidFeedbackLink />}</AppProvider>;
}
