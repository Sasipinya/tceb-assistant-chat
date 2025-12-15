import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, conversation_id } = body;

    // ใช้ environment variable โดยตรง (ไม่ต้องใช้ NEXT_PUBLIC_)
    const apiUrl = process.env.API_URL || 
      'http://cms-tvai.terodigital.com/api/chat-messages-tceb';
    
    const bearerToken = process.env.API_BEARER_TOKEN;
    const userEmail = process.env.API_USER_EMAIL || 'tero.developer@gmail.com';

    // เพิ่ม log เพื่อ debug (ระวังอย่า log token)
    console.log('API URL:', apiUrl);
    console.log('Has Bearer Token:', !!bearerToken);

    if (!bearerToken) {
      throw new Error('API_BEARER_TOKEN is not configured');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        query: query,
        inputs: {},
        response_mode: 'blocking',
        conversation_id: conversation_id || '',
        user: userEmail,
        files: [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch response',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}