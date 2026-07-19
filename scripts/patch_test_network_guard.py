from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "export async function authLogin(employeeId: string, nip: string):\n  Promise<{ status: AuthLoginStatus; user?: { id: string; name: string; role: string } }> {\n  try {",
        "export async function authLogin(employeeId: string, nip: string):\n  Promise<{ status: AuthLoginStatus; user?: { id: string; name: string; role: string } }> {\n  if (localTestModeEnabled()) return { status: 'unavailable' };\n  try {"
    ),
    (
        "export async function fetchLoginDirectory(): Promise<DirectoryUser[]> {\n  try {",
        "export async function fetchLoginDirectory(): Promise<DirectoryUser[]> {\n  if (localTestModeEnabled()) return [];\n  try {"
    ),
    (
        "async function dbList(table: string): Promise<any[]> {\n  const res = await fetch",
        "async function dbList(table: string): Promise<any[]> {\n  if (localTestModeEnabled()) throw new Error('Mode de validation local : lecture cloud bloquée');\n  const res = await fetch"
    ),
    (
        "async function dbInsert(table: string, row: Record<string, any>): Promise<any> {\n  const res = await fetch",
        "async function dbInsert(table: string, row: Record<string, any>): Promise<any> {\n  if (localTestModeEnabled()) throw new Error('Mode de validation local : écriture cloud bloquée');\n  const res = await fetch"
    ),
    (
        "async function dbUpsert(table: string, row: Record<string, any>): Promise<any> {\n  const res = await fetch",
        "async function dbUpsert(table: string, row: Record<string, any>): Promise<any> {\n  if (localTestModeEnabled()) throw new Error('Mode de validation local : écriture cloud bloquée');\n  const res = await fetch"
    ),
    (
        "async function dbUpdate(table: string, id: string, row: Record<string, any>): Promise<any> {\n  const res = await fetch",
        "async function dbUpdate(table: string, id: string, row: Record<string, any>): Promise<any> {\n  if (localTestModeEnabled()) throw new Error('Mode de validation local : écriture cloud bloquée');\n  const res = await fetch"
    ),
    (
        "async function dbDelete(table: string, id: string): Promise<void> {\n  const res = await fetch",
        "async function dbDelete(table: string, id: string): Promise<void> {\n  if (localTestModeEnabled()) throw new Error('Mode de validation local : suppression cloud bloquée');\n  const res = await fetch"
    ),
    (
        "export async function hydrateFromCloud(): Promise<CloudHydrateResult> {\n  try {",
        "export async function hydrateFromCloud(): Promise<CloudHydrateResult> {\n  if (localTestModeEnabled()) return { enabled: false, tables: {} };\n  try {"
    )
]

for old, new in replacements:
    if new not in text:
        if old not in text:
            raise RuntimeError(f'Ancre de garde réseau introuvable : {old.splitlines()[0]}')
        text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Tous les accès cloud sont bloqués en mode de validation local.')
