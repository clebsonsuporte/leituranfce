import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { currentCompetencia } from '../lib/utils'

interface FilterState {
  selectedCompanyId: string | undefined
  selectedCompetencia: string
  setCompany: (companyId: string | undefined) => void
  setCompetencia: (competencia: string) => void
  reset: () => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      selectedCompanyId: undefined,
      selectedCompetencia: currentCompetencia(),

      setCompany: (companyId) => {
        set({ selectedCompanyId: companyId })
      },

      setCompetencia: (competencia) => {
        set({ selectedCompetencia: competencia })
      },

      reset: () => {
        set({
          selectedCompanyId: undefined,
          selectedCompetencia: currentCompetencia(),
        })
      },
    }),
    {
      name: 'fiscal-filters',
    }
  )
)
