import re

with open('components/shoots/schedule-shoot-modal.tsx', 'r') as f:
    content = f.read()

# Make sure if initialClientId is passed, we select its tab
initial_client_regex = r"setClients\(enriched\);"
new_initial_client = """setClients(enriched);
        if (initialClientId) {
          const initial = enriched.find(c => c.id === initialClientId);
          if (initial) {
            setActiveTab(initial.agency?.toLowerCase().includes('anderson') ? 'ac' : 'nativz');
          }
        }"""
content = re.sub(initial_client_regex, new_initial_client, content)

with open('components/shoots/schedule-shoot-modal.tsx', 'w') as f:
    f.write(content)
