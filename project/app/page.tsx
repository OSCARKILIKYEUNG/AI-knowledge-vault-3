import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Brain, Search, Lightbulb, Link as LinkIcon } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">AI Knowledge Vault</h1>
          </div>
          <div className="space-x-4">
            <Link href="/login">
              <Button variant="ghost">登入</Button>
            </Link>
            <Link href="/login">
              <Button>開始使用</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <h2 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            智能知識管理系統
          </h2>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            使用 AI 技術整理、搜尋和管理您的知識庫。支援文字提示和網頁連結，自動生成摘要和智能搜尋。
          </p>
          <Link href="/login">
            <Button size="lg" className="px-8 py-3 text-lg">
              立即開始
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <div className="text-center p-8 rounded-2xl bg-white shadow-sm border hover:shadow-md transition-shadow">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lightbulb className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">智能摘要</h3>
            <p className="text-gray-600">
              AI 自動為您的內容生成繁體中文摘要，快速了解重點資訊。
            </p>
          </div>

          <div className="text-center p-8 rounded-2xl bg-white shadow-sm border hover:shadow-md transition-shadow">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">向量搜尋</h3>
            <p className="text-gray-600">
              基於語義相似性的智能搜尋，找到最相關的知識內容。
            </p>
          </div>

          <div className="text-center p-8 rounded-2xl bg-white shadow-sm border hover:shadow-md transition-shadow">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LinkIcon className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">多元內容</h3>
            <p className="text-gray-600">
              支援文字提示、網頁連結和圖片上傳，全方位管理您的知識。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}