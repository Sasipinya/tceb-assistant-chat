import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, conversation_id } = body;

    const response = await fetch(
      process.env.NEXT_PUBLIC_API_URL ||
        'http://cms-tvai.terodigital.com/api/chat-messages-tceb',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.API_BEARER_TOKEN}`,
        },
        body: JSON.stringify({
          query: query,
          inputs: {},
          response_mode: 'blocking',
          conversation_id: conversation_id || '',
          user: process.env.API_USER_EMAIL || 'tero.developer@gmail.com',
          files: [],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch response' },
      { status: 500 }
    );
  }
}
