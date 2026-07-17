import { useState } from 'react';
import useAppStore from '../store';
import { genId } from '../apiClient';
import { translations } from '../translations';
import { Project, ProjectTask, ProjectTool } from '../types';
import { Trash, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface ProjectTasksAndToolsProps {
  project: Project;
  defaultOpen?: boolean;
  bordered?: boolean;
}

// Liste de tâches (à cocher une fois le travail terminé sur le chantier) et
// liste d'outils à apporter, rattachées à un chantier. Utilisé à la fois
// dans l'onglet Projets (admin) et dans le tableau de bord de l'employé
// pendant son punch actif.
export default function ProjectTasksAndTools({ project, defaultOpen = false, bordered = true }: ProjectTasksAndToolsProps) {
  const { activeEmployee, updateProject, currentLanguage } = useAppStore();
  const t = translations[currentLanguage];
  const canManage = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';

  const [expanded, setExpanded] = useState(defaultOpen);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'normal' | 'critique'>('normal');
  const [newToolName, setNewToolName] = useState('');

  const tasks = project.tasks || [];
  const tools = project.tools || [];
  const doneCount = tasks.filter(t => t.done).length;

  const addTask = () => {
    if (!newTaskText.trim()) return;
    const task: ProjectTask = {
      id: genId(),
      text: newTaskText.trim(),
      done: false,
      priority: newTaskPriority,
      createdAt: new Date().toISOString()
    };
    updateProject({ ...project, tasks: [...tasks, task] });
    setNewTaskText('');
    setNewTaskPriority('normal');
  };

  const toggleTask = (id: string) => {
    updateProject({ ...project, tasks: tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) });
  };

  const deleteTask = (id: string) => {
    updateProject({ ...project, tasks: tasks.filter(t => t.id !== id) });
  };

  const addTool = () => {
    if (!newToolName.trim()) return;
    const tool: ProjectTool = { id: genId(), name: newToolName.trim(), brought: false };
    updateProject({ ...project, tools: [...tools, tool] });
    setNewToolName('');
  };

  const toggleTool = (id: string) => {
    updateProject({ ...project, tools: tools.map(t => t.id === id ? { ...t, brought: !t.brought } : t) });
  };

  const deleteTool = (id: string) => {
    updateProject({ ...project, tools: tools.filter(t => t.id !== id) });
  };

  return (
    <div className={`text-left ${bordered ? 'mt-3 pt-3 border-t border-gray-850' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-[10px] text-gray-400 hover:text-white uppercase font-mono font-bold cursor-pointer"
      >
        <span>📋 {t.tasksWord} ({doneCount}/{tasks.length}) &nbsp;•&nbsp; 🧰 {t.toolsWord} ({tools.length})</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {/* Tâches */}
          <div className="space-y-1.5">
            <span className="text-[9px] text-gray-500 uppercase font-mono font-bold">{t.tasksTodo}</span>
            {tasks.length === 0 && <p className="text-[10px] text-gray-600 italic">{t.noTasksForSite}</p>}
            {tasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 p-1.5 bg-gray-950 rounded-lg border border-gray-850">
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border cursor-pointer transition ${
                    task.done ? 'bg-green-600 border-green-500' : 'bg-gray-900 border-gray-700'
                  }`}
                  title={task.done ? t.markTodo : t.markDone}
                >
                  {task.done && <Check className="w-3 h-3 text-white" />}
                </button>
                <span className={`flex-1 text-xs ${task.done ? 'line-through text-gray-500' : 'text-white'}`}>{task.text}</span>
                {task.priority === 'critique' && !task.done && (
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex-shrink-0">
                    {t.criticalWord}
                  </span>
                )}
                {canManage && (
                  <button onClick={() => deleteTask(task.id)} className="text-gray-600 hover:text-red-400 flex-shrink-0 cursor-pointer">
                    <Trash className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder={t.taskInputPh}
                  className="flex-1 p-1.5 bg-gray-950 text-white text-[11px] rounded border border-gray-850"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTask()}
                />
                <select
                  className="bg-gray-950 text-white text-[10px] rounded border border-gray-850 px-1"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as 'normal' | 'critique')}
                >
                  <option value="normal">{t.normalWord}</option>
                  <option value="critique">{t.criticalWord}</option>
                </select>
                <button
                  onClick={addTask}
                  className="px-3 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black rounded cursor-pointer"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {/* Outils */}
          <div className="space-y-1.5">
            <span className="text-[9px] text-gray-500 uppercase font-mono font-bold">{t.toolsToBring}</span>
            {tools.length === 0 && <p className="text-[10px] text-gray-600 italic">{t.noToolsListed}</p>}
            {tools.map(tool => (
              <div key={tool.id} className="flex items-center gap-2 p-1.5 bg-gray-950 rounded-lg border border-gray-850">
                <button
                  onClick={() => toggleTool(tool.id)}
                  className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border cursor-pointer transition ${
                    tool.brought ? 'bg-green-600 border-green-500' : 'bg-gray-900 border-gray-700'
                  }`}
                  title={tool.brought ? t.markNotBrought : t.markBrought}
                >
                  {tool.brought && <Check className="w-3 h-3 text-white" />}
                </button>
                <span className={`flex-1 text-xs ${tool.brought ? 'text-gray-500' : 'text-white'}`}>{tool.name}</span>
                {canManage && (
                  <button onClick={() => deleteTool(tool.id)} className="text-gray-600 hover:text-red-400 flex-shrink-0 cursor-pointer">
                    <Trash className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder={t.toolInputPh}
                  className="flex-1 p-1.5 bg-gray-950 text-white text-[11px] rounded border border-gray-850"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTool()}
                />
                <button
                  onClick={addTool}
                  className="px-3 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black rounded cursor-pointer"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
