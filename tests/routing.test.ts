import assert from 'node:assert/strict'
import test from 'node:test'
import { guardRoute } from '../src/app/routing'

test('deep links lead to the earliest missing answer', () => {
  assert.equal(guardRoute('saved', 'budget', false), 'budget')
  assert.equal(guardRoute('board', 'location', false), 'location')
  assert.equal(guardRoute('saved', 'board', false), 'board')
})

test('saved snapshot remains accessible during an interrupted edit', () => {
  assert.equal(guardRoute('saved', 'budget', true), 'saved')
  assert.equal(guardRoute('budget', 'board', true), 'budget')
  assert.equal(guardRoute('home', 'location', true), 'home')
})
