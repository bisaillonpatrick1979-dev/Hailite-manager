import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  AlertCircle, Check, Edit3, MapPin, RotateCcw, Search, Trash2, Users, X
} from 'lucide-react';
import useAppStore from '../store';
import type { Project, ProjectTask, ProjectTool } from '../types';

const ProjectTasksAndTools = lazy(() => import('./ProjectTasksAndTools'));

type ProjectEditForm = {
  name: string;
  clientName: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
  status: Project['status'];
  tasksText: string;
  toolsText: string;
  assignedEmployees: string[];
};

const normalize = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const taskToLine = (task: ProjectTask): string => `${task.priority === 'critique' ? '! ' : ''}${task.text}`;

export default function ProjectDirectoryManager() {
  const {
    projects,
    employees,
    activeEmployee,
    currentLanguage,
    updateProject,
    deleteProject
  } = useAppStore();

  const isFR = currentLanguage === 'FR';
  const canManage = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProjectEditForm | null>(null);

  const filteredProjects = useMemo(() => {
    const query = normalize(searchQuery);
    return [...projects]
      .filter(project => {
        if (!query) return true;
        const assignedNames = employees
          .filter(employee => project.assignedEmployees?.includes(employee.id))
          .map(employee => employee.name)
          .join(' ');
        const taskText = (project.tasks || []).map(task => task.text).join(' ');
        const toolText = (project.tools || []).map(tool => tool.name).join(' ');
        return normalize([
          project.name,
          project.clientName,
          project.address,
          project.status,
          assignedNames,
          taskText,
          toolText
        ].join(' ')).includes(query);
      })
      .sort((a, b) => {
        const statusRank: Record<Project['status'], number> = { active: 0, 'on-hold': 1, completed: 2 };
        return statusRank[a.status] - statusRank[b.status] || a.name.localeCompare(b.name, isFR ? 'fr-CA' : 'en-CA');
      });
  }, [projects, employees, searchQuery, isFR]);

  const openEditor = (project: Project) => {
    setEditingProjectId(project.id);
    setEditForm({
      name: project.name,
      clientName: project.clientName,
      address: project.address,
      latitude: project.latitude,
      longitude: project.longitude,
      radius: project.radius,
      status: project.status,
      tasksText: (project.tasks || []).map(taskToLine).join('\n'),
      toolsText: (project.tools || []).map(tool => tool.name).join('\n'),
      assignedEmployees: [...(project.assignedEmployees || [])]
    });
  };

  const closeEditor = () => {
    setEditingProjectId(null);
    setEditForm(null);
  };

  const rebuildTasks = (project: Project, text: string): ProjectTask[] => {
    const existingByText = new Map((project.tasks || []).map(task => [normalize(task.text), task]));
    const now = new Date().toISOString();
    return text.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const critical = line.startsWith('!');
        const taskText = line.replace(/^!\s*/, '').trim();
        const previous = existingByText.get(normalize(taskText));
        return previous
          ? { ...previous, text: taskText, priority: critical ? 'critique' : 'normal' }
          : {
              id: crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random()}`,
              text: taskText,
              done: false,
              priority: critical ? 'critique' : 'normal',
              createdAt: now
            };
      });
  };

  const rebuildTools = (project: Project, text: string): ProjectTool[] => {
    const existingByName = new Map((project.tools || []).map(tool => [normalize(tool.name), tool]));
    return text.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(name => {
        const previous = existingByName.get(normalize(name));
        return previous
          ? { ...previous, name }
          : {
              id: crypto.randomUUID ? crypto.randomUUID() : `tool-${Date.now()}-${Math.random()}`,
              name,
              brought: false
            };
      });
  };

  const saveProject = () => {
    if (!editForm || !editingProjectId) return;
    const project = projects.find(item => item.id === editingProjectId);
    if (!project) return;
    if (!editForm.name.trim() || !editForm.clientName.trim() || !editForm.address.trim()) {
      alert(isFR ? 'Le nom du chantier, le client et l’adresse sont obligatoires.' : 'Project name, client, and address are required.');
      return;
    }

    updateProject({
      ...project,
      name: editForm.name.trim(),
      clientName: editForm.clientName.trim(),
      address: editForm.address.trim(),
      latitude: Number(editForm.latitude) || 0,
      longitude: Number(editForm.longitude) || 0,
      radius: Math.max(10, Number(editForm.radius) || 100),
      status: editForm.status,
      assignedEmployees: editForm.assignedEmployees,
      tasks: rebuildTasks(project, editForm.tasksText),
      tools: rebuildTools(project, editForm.toolsText)
    });
    closeEditor();
  };

  const capturePosition = () => {
    if (!editForm) return;
    if (!navigator.geolocation) {
      alert(isFR ? 'La géolocalisation n’est pas prise en charge sur cet appareil.' : 'Geolocation is not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => setEditForm(current => current ? {
        ...current,
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6))
      } : current),
      error => alert(isFR ? `Impossible de lire la position : ${error.message}` : `Unable to read location: ${error.message}`),
      { enableHighAccuracy: true }
    );
  };

  return (
    <section id="project-search-and-directory" className="space-y-4">
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-transparent p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <label htmlFor="project-directory-search" className="mb-2 block text-xs font-black uppercase tracking-widest text-orange-300">
              {isFR ? 'Rechercher un chantier ou un projet' : 'Search projects'}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                id="project-directory-search"
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={isFR ? 'Nom, client, adresse, employé, tâche ou outil…' : 'Name, client, address, employee, task, or tool…'}
                className="min-h-12 w-full rounded-xl border border-gray-700 bg-gray-950 py-3 pl-12 pr-12 text-base text-white outline-none placeholder:text-gray-600 focus:border-orange-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-800 hover:text-white"
                  aria-label={isFR ? 'Effacer la recherche' : 'Clear search'}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-black/25 px-4 py-3 text-center">
            <span className="block text-2xl font-black text-white">{filteredProjects.length}</span>
            <span className="text-[10px] font-bold uppercase text-gray-500">
              {isFR ? `sur ${projects.length} chantier(s)` : `of ${projects.length} project(s)`}
            </span>
          </div>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-gray-500" />
          <p className="mt-2 text-sm font-bold text-gray-300">{isFR ? 'Aucun chantier ne correspond à cette recherche.' : 'No project matches this search.'}</p>
          <button type="button" onClick={() => setSearchQuery('')} className="mt-3 inline-flex items-center gap-2 text-xs font-black text-orange-400 hover:text-orange-300">
            <RotateCcw className="h-4 w-4" /> {isFR ? 'Afficher tous les chantiers' : 'Show all projects'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredProjects.map(project => {
            const assigned = employees.filter(employee => project.assignedEmployees?.includes(employee.id));
            const statusLabel = project.status === 'active'
              ? (isFR ? 'Actif' : 'Active')
              : project.status === 'completed'
                ? (isFR ? 'Terminé' : 'Completed')
                : (isFR ? 'En attente' : 'On hold');
            return (
              <article key={project.id} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="truncate text-lg font-black text-white">{project.name}</h4>
                      <p className="mt-1 truncate text-sm font-bold text-orange-300">{project.clientName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase ${
                      project.status === 'active'
                        ? 'border-green-500/30 bg-green-500/10 text-green-300'
                        : project.status === 'completed'
                          ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}>{statusLabel}</span>
                  </div>

                  <div className="mt-4 space-y-2 rounded-xl border border-gray-800 bg-gray-950/50 p-3 text-sm text-gray-300">
                    <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" /><span>{project.address}</span></p>
                    <p className="text-xs font-mono text-gray-500">GPS: {project.latitude.toFixed(6)}, {project.longitude.toFixed(6)} · {isFR ? 'Rayon' : 'Radius'} {project.radius} m</p>
                    <p className="flex items-center gap-2 text-xs"><Users className="h-4 w-4 text-cyan-400" /><span>{assigned.length ? assigned.map(employee => employee.name).join(', ') : (isFR ? 'Aucun travailleur assigné' : 'No assigned workers')}</span></p>
                  </div>

                  {canManage && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-800 pt-4">
                      <button type="button" onClick={() => openEditor(project)} className="min-h-11 flex-1 rounded-xl bg-orange-600 px-4 text-sm font-black text-white transition hover:bg-orange-500">
                        <span className="inline-flex items-center justify-center gap-2"><Edit3 className="h-4 w-4" />{isFR ? 'Modifier toutes les informations' : 'Edit all information'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const confirmed = window.confirm(isFR
                            ? `Supprimer définitivement le chantier « ${project.name} »?`
                            : `Permanently delete project “${project.name}”?`);
                          if (confirmed) deleteProject(project.id);
                        }}
                        className="flex min-h-11 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-red-300 transition hover:bg-red-500/20"
                        aria-label={isFR ? 'Supprimer le chantier' : 'Delete project'}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-800 bg-[#11141A] p-4">
                  <Suspense fallback={<p className="text-xs text-gray-500">{isFR ? 'Chargement…' : 'Loading…'}</p>}>
                    <ProjectTasksAndTools project={project} />
                  </Suspense>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingProjectId && editForm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-black/85 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={isFR ? 'Modifier le chantier' : 'Edit project'}>
          <div className="my-4 max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-orange-500/30 bg-[#151820] shadow-2xl">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-800 bg-[#151820]/95 px-4 py-4 backdrop-blur sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">{isFR ? 'Modification complète' : 'Complete editing'}</p>
                <h3 className="text-xl font-black text-white">{editForm.name}</h3>
              </div>
              <button type="button" onClick={closeEditor} className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
            </header>

            <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-2">
              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>{isFR ? 'Nom du chantier' : 'Project name'}</span>
                <input value={editForm.name} onChange={event => setEditForm({ ...editForm, name: event.target.value })} className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 text-base text-white outline-none focus:border-orange-500" />
              </label>
              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>{isFR ? 'Client' : 'Client'}</span>
                <input value={editForm.clientName} onChange={event => setEditForm({ ...editForm, clientName: event.target.value })} className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 text-base text-white outline-none focus:border-orange-500" />
              </label>
              <label className="space-y-1 text-xs font-bold text-gray-400 md:col-span-2">
                <span>{isFR ? 'Adresse du chantier' : 'Project address'}</span>
                <input value={editForm.address} onChange={event => setEditForm({ ...editForm, address: event.target.value })} className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 text-base text-white outline-none focus:border-orange-500" />
              </label>

              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>Latitude</span>
                <input type="number" step="0.000001" value={editForm.latitude} onChange={event => setEditForm({ ...editForm, latitude: Number(event.target.value) })} className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 text-base text-white outline-none focus:border-orange-500" />
              </label>
              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>Longitude</span>
                <input type="number" step="0.000001" value={editForm.longitude} onChange={event => setEditForm({ ...editForm, longitude: Number(event.target.value) })} className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 text-base text-white outline-none focus:border-orange-500" />
              </label>
              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>{isFR ? 'Rayon GPS (mètres)' : 'GPS radius (metres)'}</span>
                <input type="number" min="10" value={editForm.radius} onChange={event => setEditForm({ ...editForm, radius: Number(event.target.value) })} className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 text-base text-white outline-none focus:border-orange-500" />
              </label>
              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>{isFR ? 'État du chantier' : 'Project status'}</span>
                <select value={editForm.status} onChange={event => setEditForm({ ...editForm, status: event.target.value as Project['status'] })} className="min-h-11 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 text-base text-white outline-none focus:border-orange-500">
                  <option value="active">{isFR ? 'Actif' : 'Active'}</option>
                  <option value="on-hold">{isFR ? 'En attente' : 'On hold'}</option>
                  <option value="completed">{isFR ? 'Terminé' : 'Completed'}</option>
                </select>
              </label>

              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button type="button" onClick={capturePosition} className="min-h-11 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 text-sm font-black text-cyan-200 hover:bg-cyan-500/20">{isFR ? 'Utiliser ma position actuelle' : 'Use my current location'}</button>
                <button type="button" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(editForm.address)}`, '_blank')} className="min-h-11 rounded-xl border border-gray-700 bg-gray-900 px-4 text-sm font-black text-gray-300 hover:text-white">Google Maps</button>
              </div>

              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>{isFR ? 'Tâches — une par ligne; ! = critique' : 'Tasks — one per line; ! = critical'}</span>
                <textarea rows={7} value={editForm.tasksText} onChange={event => setEditForm({ ...editForm, tasksText: event.target.value })} className="w-full resize-y rounded-xl border border-gray-700 bg-gray-950 p-3 text-sm text-white outline-none focus:border-orange-500" />
              </label>
              <label className="space-y-1 text-xs font-bold text-gray-400">
                <span>{isFR ? 'Outils requis — un par ligne' : 'Required tools — one per line'}</span>
                <textarea rows={7} value={editForm.toolsText} onChange={event => setEditForm({ ...editForm, toolsText: event.target.value })} className="w-full resize-y rounded-xl border border-gray-700 bg-gray-950 p-3 text-sm text-white outline-none focus:border-orange-500" />
              </label>

              <fieldset className="rounded-2xl border border-gray-800 bg-gray-950/50 p-4 md:col-span-2">
                <legend className="px-2 text-xs font-black uppercase tracking-wider text-gray-300">{isFR ? 'Travailleurs assignés' : 'Assigned workers'}</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {employees.filter(employee => employee.role !== 'admin').map(employee => {
                    const checked = editForm.assignedEmployees.includes(employee.id);
                    return (
                      <label key={employee.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked ? 'border-orange-500/40 bg-orange-500/10 text-orange-100' : 'border-gray-800 bg-gray-900 text-gray-400'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setEditForm({
                            ...editForm,
                            assignedEmployees: checked
                              ? editForm.assignedEmployees.filter(id => id !== employee.id)
                              : [...editForm.assignedEmployees, employee.id]
                          })}
                          className="h-5 w-5 accent-orange-500"
                        />
                        <span className="text-sm font-bold">{employee.name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <footer className="sticky bottom-0 flex gap-3 border-t border-gray-800 bg-[#151820]/95 p-4 backdrop-blur sm:px-6">
              <button type="button" onClick={closeEditor} className="min-h-12 flex-1 rounded-xl border border-gray-700 bg-gray-900 text-sm font-black text-gray-300 hover:text-white">{isFR ? 'Annuler' : 'Cancel'}</button>
              <button type="button" onClick={saveProject} className="min-h-12 flex-[2] rounded-xl bg-orange-600 text-sm font-black text-white shadow-lg hover:bg-orange-500"><span className="inline-flex items-center gap-2"><Check className="h-5 w-5" />{isFR ? 'Enregistrer les modifications' : 'Save changes'}</span></button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
