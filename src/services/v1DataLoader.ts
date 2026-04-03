import * as fs from 'fs'
import * as path from 'path'
import { V1BabelJson, v1BabelJsonSchema } from '../types'

export const v1DataLoader = {
  /**
   * Load and validate v1 babel.json
   */
  loadBabelJson(babelJsonPath: string): V1BabelJson {
    if (!fs.existsSync(babelJsonPath)) {
      throw new Error('babel.json not found at: ' + babelJsonPath)
    }

    let content: unknown
    try {
      const fileContent = fs.readFileSync(babelJsonPath, 'utf-8')
      content = JSON.parse(fileContent)
    } catch (error) {
      throw new Error('Failed to parse babel.json: ' + (error instanceof Error ? error.message : String(error)))
    }

    try {
      const parsed = v1BabelJsonSchema.parse(content)
      return parsed
    } catch (error) {
      throw new Error('Invalid babel.json structure: ' + (error instanceof Error ? error.message : String(error)))
    }
  },

  /**
   * List all .md files in a story directory
   */
  getStoryFiles(storyDir: string): string[] {
    if (!fs.existsSync(storyDir)) {
      return []
    }

    const files = fs.readdirSync(storyDir, { withFileTypes: true })
    return files
      .filter(file => file.isFile() && file.name.endsWith('.md'))
      .map(file => file.name)
  },

  /**
   * Count words in a file
   */
  getFileWordCount(filePath: string): number {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found: ' + filePath)
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const words = content.trim().split(/\s+/).filter(word => word.length > 0)
    return words.length
  },

  /**
   * Read file content as string
   */
  readFileContent(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found: ' + filePath)
    }
    return fs.readFileSync(filePath, 'utf-8')
  },
}
