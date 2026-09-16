import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Helper to format inline bold, code, and badges
  const renderInline = (text: string): React.ReactNode[] => {
    // Split by bold (**text**) and inline code (`text`)
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        const codeContent = part.slice(1, -1);
        let badgeStyle = "bg-indigo-50 text-indigo-700 border-indigo-200";
        if (["HIGH", "CRITICAL", "High", "Critical", "URGENT"].includes(codeContent)) {
          badgeStyle = "bg-red-50 text-red-700 border-red-200";
        } else if (["MEDIUM", "Medium", "In Progress", "IN_PROGRESS"].includes(codeContent)) {
          badgeStyle = "bg-amber-50 text-amber-700 border-amber-200";
        } else if (["LOW", "Low", "Completed", "Approved", "UPCOMING", "SCHEDULED"].includes(codeContent)) {
          badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
        }
        return (
          <span key={index} className={`inline-block px-1.5 py-0.5 text-xs font-semibold rounded border ${badgeStyle} mx-0.5`}>
            {codeContent}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let isList = false;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      isList = true;
      const bulletText = trimmed.substring(2);
      listItems.push(
        <li key={`li-${idx}`} className="ml-4 list-disc text-gray-700 space-y-0.5">
          {renderInline(bulletText)}
        </li>
      );
    } else {
      if (isList && listItems.length > 0) {
        elements.push(
          <ul key={`ul-${idx}`} className="space-y-1 my-2 pl-2">
            {listItems}
          </ul>
        );
        listItems = [];
        isList = false;
      }

      if (trimmed.startsWith('#### ')) {
        elements.push(
          <h4 key={idx} className="text-sm font-bold text-gray-900 mt-2 mb-1">
            {renderInline(trimmed.substring(5))}
          </h4>
        );
      } else if (trimmed.startsWith('### ')) {
        elements.push(
          <h3 key={idx} className="text-base font-bold text-gray-900 mt-3 mb-1.5 border-b border-gray-100 pb-1">
            {renderInline(trimmed.substring(4))}
          </h3>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h2 key={idx} className="text-lg font-bold text-gray-900 mt-3 mb-1.5">
            {renderInline(trimmed.substring(3))}
          </h2>
        );
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h1 key={idx} className="text-xl font-extrabold text-gray-900 mt-4 mb-2">
            {renderInline(trimmed.substring(2))}
          </h1>
        );
      } else if (trimmed.length === 0) {
        elements.push(<div key={idx} className="h-1.5" />);
      } else {
        elements.push(
          <p key={idx} className="text-sm text-gray-800 leading-relaxed my-0.5">
            {renderInline(trimmed)}
          </p>
        );
      }
    }
  });

  if (isList && listItems.length > 0) {
    elements.push(
      <ul key={`ul-last`} className="space-y-1 my-2 pl-2">
        {listItems}
      </ul>
    );
  }

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};

export default MarkdownRenderer;
