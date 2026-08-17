import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Menubar,
  MenubarContent,
  MenubarFormField,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from './menubar'

const TestMenubar = () => (
  <Menubar>
    <MenubarMenu value="search">
      <MenubarTrigger>Search</MenubarTrigger>
      <MenubarContent>
        <MenubarFormField>
          <label htmlFor="search-field">Search</label>
          <input id="search-field" />
        </MenubarFormField>
        <MenubarItem>Search cards</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu value="sort">
      <MenubarTrigger>Sort</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Newest first</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
)

describe('Menubar primitive', () => {
  it('keeps exactly one menu open when switching between triggers', async () => {
    const user = userEvent.setup()
    render(<TestMenubar />)

    await user.click(screen.getByRole('menuitem', { name: 'Search' }))
    expect(screen.getByRole('menu')).toHaveTextContent('Search cards')

    await user.hover(screen.getByRole('menuitem', { name: 'Sort' }))
    expect(screen.getByRole('menu')).toHaveTextContent('Newest first')
    expect(screen.queryByText('Search cards')).not.toBeInTheDocument()
  })

  it('keeps focus in a form field while typing inside menu content', async () => {
    const user = userEvent.setup()
    render(<TestMenubar />)

    await user.click(screen.getByRole('menuitem', { name: 'Search' }))
    const field = screen.getByRole('textbox', { name: 'Search' })
    await user.click(field)
    await user.type(field, 'S')

    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveValue('S')
  })
})
