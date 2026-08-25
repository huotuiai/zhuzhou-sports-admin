import { describe, expect, it } from 'vitest'
import {
  buildSignString,
  collectBusinessParameters,
  createSignatureHeaders,
  hmacSha256Hex,
  serializeQueryParameters,
} from './signature'

describe('API request signature', () => {
  it('matches the standard HMAC-SHA256 test vector', async () => {
    await expect(hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).resolves.toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
  })

  it('flattens values, omits undefined and lets query override body', () => {
    const parameters = collectBusinessParameters(
      {
        title: 'A区',
        body: '',
        nullable: null,
        enabled: false,
        attachments: [1, { x: '中文' }],
        extra: { a: 1 },
        duplicate: 'body',
        omitted: undefined,
        timestamp: 'must-not-participate',
      },
      { duplicate: 'query', page: 1 },
    )

    expect(buildSignString({ ...parameters, timestamp: '1733880000', nonce: 'abc12345' })).toBe(
      'attachments=[1,{"x":"中文"}]&body=&duplicate=query&enabled=false&extra={"a":1}&nonce=abc12345&nullable=&page=1&timestamp=1733880000&title=A区',
    )
  })

  it('does not URL encode the signing string but does encode the outgoing query', () => {
    expect(buildSignString({ keyword: '东门 & A', nonce: 'n1234567', timestamp: '1' })).toContain('keyword=东门 & A')
    expect(serializeQueryParameters({ keyword: '东门 & A', empty: '', nil: null, omitted: undefined })).toBe(
      'keyword=%E4%B8%9C%E9%97%A8+%26+A&empty=&nil=',
    )
  })

  it('creates all required headers from fixed timestamp and nonce', async () => {
    const headers = await createSignatureHeaders('test-secret', { username: 'admin' }, {
      timestamp: '1733880000',
      nonce: 'abc12345',
    })
    expect(headers).toEqual({
      'X-Timestamp': '1733880000',
      'X-Nonce': 'abc12345',
      'X-Sign': expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })
})
