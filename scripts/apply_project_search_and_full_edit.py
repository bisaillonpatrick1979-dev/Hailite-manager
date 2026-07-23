from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    text = text.replace(old, new, 1)


replace_once(
    "const ProjectTasksAndTools = lazy(() => import('./components/ProjectTasksAndTools'));\n",
    """const ProjectTasksAndTools = lazy(() => import('./components/ProjectTasksAndTools'));
const ProjectDirectoryManager = lazy(() => import('./components/ProjectDirectoryManager'));
""",
    'import gestionnaire projets'
)

start = text.find('                {/* Display projects list */}')
end_marker = "\n              </div>\n            )}\n\n            {/* -------------------- VIEW CONTAINER : DOCUMENTS"
end = text.find(end_marker, start)
if start == -1 or end == -1:
    raise RuntimeError(f'Bloc de liste des projets introuvable: debut={start}, fin={end}')

replacement = """                {/* Recherche immédiate et gestion complète des chantiers. */}
                <Suspense fallback={<LazySectionFallback />}>
                  <ProjectDirectoryManager />
                </Suspense>"""

text = text[:start] + replacement + text[end:]
path.write_text(text, encoding='utf-8')
print('Recherche et modification complète des projets intégrées sous le formulaire de création.')
