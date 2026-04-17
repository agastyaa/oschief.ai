import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCOUNT_LS_KEY } from '@/lib/account-context'
import { loadAccount, ROLE_OPTIONS } from '../shared/prefs'

export function AccountSection() {
  const [account, setAccount] = useState(loadAccount);
  const [saved, setSaved] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  const handleChange = (field: string, value: string) => {
    setAccount((prev: any) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleRoleSelect = (roleId: string) => {
    const role = ROLE_OPTIONS.find(r => r.id === roleId);
    setAccount((prev: any) => ({
      ...prev,
      roleId,
      role: roleId === 'custom' ? prev.role : (role?.label ?? ''),
    }));
    setRoleDropdownOpen(false);
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(ACCOUNT_LS_KEY, JSON.stringify(account));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    if (!roleDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [roleDropdownOpen]);

  const selectedRole = ROLE_OPTIONS.find(r => r.id === account.roleId);
  const isCustomRole = account.roleId === 'custom';

  const textFields = [
    { key: "name", label: "Name", placeholder: "Your name" },
    { key: "email", label: "Email", placeholder: "you@example.com" },
    { key: "company", label: "Company", placeholder: "e.g. Acme Inc." },
  ];

  return (
    <>
      <div className="space-y-3">
        {textFields.map((field) => (
          <div key={field.key}>
            <label className="text-body-sm font-medium text-foreground">{field.label}</label>
            <input
              value={account[field.key] || ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
        ))}

        <div ref={roleDropdownRef} className="relative">
          <label className="text-body-sm font-medium text-foreground">Role</label>
          <p className="text-[11px] text-muted-foreground mb-1">Your role determines the coaching advice and frameworks OSChief uses.</p>
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            className="mt-1 flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground hover:bg-secondary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <span className="flex items-center gap-2">
              {selectedRole ? (
                <>
                  <span>{selectedRole.icon}</span>
                  <span>{selectedRole.label}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select your role...</span>
              )}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", roleDropdownOpen && "rotate-180")} />
          </button>

          {roleDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-full rounded-[10px] border border-border bg-popover shadow-lg z-50 overflow-hidden py-1 max-h-64 overflow-y-auto">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleRoleSelect(role.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-body-sm transition-colors",
                    account.roleId === role.id
                      ? "bg-secondary text-foreground font-medium"
                      : "text-foreground hover:bg-secondary/60"
                  )}
                >
                  <span className="w-5 text-center">{role.icon}</span>
                  <span>{role.label}</span>
                  {account.roleId === role.id && <Check className="h-3.5 w-3.5 ml-auto text-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {isCustomRole && (
          <div>
            <label className="text-body-sm font-medium text-foreground">Custom Role</label>
            <input
              value={account.role || ""}
              onChange={(e) => handleChange("role", e.target.value)}
              placeholder="e.g. Product Marketing Manager"
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:opacity-90"
        >
          <Save className="h-3 w-3" />
          Save Changes
        </button>
        {saved && <span className="text-xs text-accent flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
      </div>
    </>
  );
}
