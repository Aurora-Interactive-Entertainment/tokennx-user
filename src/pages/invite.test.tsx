import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordInvitationVisit } from '@/api/invitation'
import { AppStoreProvider } from '@/data/app-state'
import { Provider } from 'react-redux'
import { createAppStore } from '@/store'
import { InviteLandingPage } from './invite'

vi.mock('@/api/invitation', () => ({ recordInvitationVisit: vi.fn() }))

const recordInvitationVisitMock = vi.mocked(recordInvitationVisit)

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

describe('邀请访问中间页', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    recordInvitationVisitMock.mockResolvedValue({})
  })

  it('记录访问后回到首页并继续携带邀请码', async () => {
    render(
      <MemoryRouter initialEntries={['/invite?invite_code=invite%2Fcode']}>
        <Provider store={createAppStore()}><AppStoreProvider><Routes>
          <Route path="/invite" element={<InviteLandingPage />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes></AppStoreProvider></Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(recordInvitationVisitMock).toHaveBeenCalledWith('invite/code'))
    expect(await screen.findByTestId('location')).toHaveTextContent('/?invite_code=invite%2Fcode')
  })
})
