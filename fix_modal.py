import re

with open('components/shoots/schedule-shoot-modal.tsx', 'r') as f:
    content = f.read()

# Add activeTab state
state_regex = r"const \[step, setStep\] = useState<'select' \| 'drafts'>\('select'\);\n  const \[loading, setLoading\] = useState\(true\);"
new_state = "const [step, setStep] = useState<'select' | 'drafts'>('select');\n  const [loading, setLoading] = useState(true);\n  const [activeTab, setActiveTab] = useState<'nativz' | 'ac'>('nativz');"
content = re.sub(state_regex, new_state, content)

# Change load() to fetch monday data
load_regex = r"const \[clientsRes, linksRes\] = await Promise\.all\(\[\n\s*supabase\.from\('clients'\)\.select\('id, name'\)\.eq\('is_active', true\)\.order\('name'\),\n\s*fetch\('/api/settings/scheduling'\)\.then\(\(r\) => r\.ok \? r\.json\(\) : \{ settings: \[\] \}\),\n\s*\]\);\n\s*if \(clientsRes\.data\) setClients\(clientsRes\.data\);"
new_load = """const [clientsRes, linksRes, mondayRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('is_active', true).order('name'),
        fetch('/api/settings/scheduling').then((r) => r.ok ? r.json() : { settings: [] }),
        fetch('/api/clients/monday-cache').then((r) => r.ok ? r.json() : []),
      ]);
      
      if (clientsRes.data) {
        const enriched = clientsRes.data.map((client) => {
          const mClient = mondayRes.find((m: any) => m.name.toLowerCase() === client.name.toLowerCase());
          return {
            ...client,
            agency: mClient?.agency || 'Nativz',
            poc_email: mClient?.contacts?.[0]?.email || '',
          };
        });
        setClients(enriched);
      }"""
content = re.sub(load_regex, new_load, content)

# Filter by activeTab
filtered_regex = r"const filtered = clients\.filter\(\(c\) => c\.name\.toLowerCase\(\)\.includes\(search\.toLowerCase\(\)\)\);"
new_filtered = """const filtered = clients.filter((c) => {
    const isAC = c.agency?.toLowerCase().includes('anderson');
    const matchesTab = activeTab === 'ac' ? isAC : !isAC;
    return matchesTab && c.name.toLowerCase().includes(search.toLowerCase());
  });"""
content = re.sub(filtered_regex, new_filtered, content)

# Add tabs UI
search_ui_regex = r"\{\/\* Search \*\/\}"
new_search_ui = """{/* Tabs */}
          <div className="flex p-1 bg-surface-hover/30 rounded-lg">
            <button
              type="button"
              onClick={() => { setActiveTab('nativz'); setSelectedIds(new Set()); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'nativz' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
            >
              Nativz
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('ac'); setSelectedIds(new Set()); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'ac' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
            >
              Anderson Collaborative
            </button>
          </div>

          {/* Search */}"""
content = re.sub(search_ui_regex, new_search_ui, content)

with open('components/shoots/schedule-shoot-modal.tsx', 'w') as f:
    f.write(content)
