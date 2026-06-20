import React from 'react'

interface SidebarCardProps {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}

const SidebarCard: React.FC<SidebarCardProps> = ({ title, children, action }) => (
  <div
    className="rounded-2xl p-4 border"
    style={{
      background: 'var(--bg-secondary)',
      borderColor: 'var(--border-default)',
    }}
  >
    <div className="flex items-center justify-between mb-3.5">
      <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {action}
    </div>
    {children}
  </div>
)

export default SidebarCard
