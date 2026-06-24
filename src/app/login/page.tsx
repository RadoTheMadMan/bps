'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleAuth = async (type: 'login' | 'register') => {
    const { error } = type === 'login' 
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) alert(error.message);
    else router.push('/dashboard');
  };

  return (
    <div className="flex flex-col max-w-md mx-auto my-12 p-6 border rounded shadow">
      <h2 className="text-xl font-bold mb-4">Gatekeeper Authentication</h2>
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="border p-2 mb-2 rounded" />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="border p-2 mb-4 rounded" />
      <div className="flex gap-4">
        <button onClick={() => handleAuth('login')} className="bg-blue-600 text-white px-4 py-2 rounded w-full">Sign In</button>
        <button onClick={() => handleAuth('register')} className="bg-gray-600 text-white px-4 py-2 rounded w-full">Register</button>
      </div>
    </div>
  );
}