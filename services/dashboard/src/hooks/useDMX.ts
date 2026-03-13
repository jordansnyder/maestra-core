'use client'

import { useState, useEffect, useCallback } from 'react'
import { dmxApi } from '@/lib/api'
import { DMXNode, DMXFixture, DMXFixtureCreate, DMXFixtureUpdate, DMXNodeCreate, DMXNodeUpdate, FixturePositionUpdate } from '@/lib/types'

export function useDMX() {
  const [nodes, setNodes] = useState<DMXNode[]>([])
  const [fixtures, setFixtures] = useState<DMXFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [nodesData, fixturesData] = await Promise.all([
        dmxApi.listNodes(),
        dmxApi.listFixtures(),
      ])
      setNodes(nodesData)
      setFixtures(fixturesData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load DMX data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const createNode = useCallback(async (data: DMXNodeCreate) => {
    const node = await dmxApi.createNode(data)
    setNodes((prev) => [...prev, node])
    return node
  }, [])

  const deleteNode = useCallback(async (id: string) => {
    await dmxApi.deleteNode(id)
    setNodes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const updateNode = useCallback(async (id: string, data: DMXNodeUpdate) => {
    const updated = await dmxApi.updateNode(id, data)
    setNodes((prev) => prev.map((n) => n.id === id ? updated : n))
    return updated
  }, [])

  const createFixture = useCallback(async (data: DMXFixtureCreate) => {
    const fixture = await dmxApi.createFixture(data)
    setFixtures((prev) => [...prev, fixture])
    return fixture
  }, [])

  const updateFixture = useCallback(async (id: string, data: DMXFixtureUpdate) => {
    const updated = await dmxApi.updateFixture(id, data)
    setFixtures((prev) => prev.map((f) => f.id === id ? updated : f))
    return updated
  }, [])

  const deleteFixture = useCallback(async (id: string) => {
    await dmxApi.deleteFixture(id)
    setFixtures((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const bulkUpdatePositions = useCallback(async (positions: FixturePositionUpdate[]) => {
    await dmxApi.bulkUpdatePositions(positions)
    setFixtures((prev) =>
      prev.map((f) => {
        const update = positions.find((p) => p.id === f.id)
        return update ? { ...f, position_x: update.position_x, position_y: update.position_y } : f
      })
    )
  }, [])

  return {
    nodes,
    fixtures,
    loading,
    error,
    refresh: fetchAll,
    createNode,
    updateNode,
    deleteNode,
    createFixture,
    updateFixture,
    deleteFixture,
    bulkUpdatePositions,
  }
}
