/**
 * Server functions pour le carnet de leçons Elena.
 * Refonte v2 : règles découpées en étapes éditables (steps) + flag fondamentale.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invalidateLessonsCache } from "@/server/elena-lessons.server";

const StepSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(500),
});

export const listElenaLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("elena_lessons")
      .select("*")
      .order("is_fundamental", { ascending: false })
      .order("is_active", { ascending: false })
      .order("category", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { lessons: data ?? [] };
  });

const CreateSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().max(2000).default(""),
  category: z.string().min(1).max(40).default("general"),
  steps: z.array(StepSchema).max(20).default([]),
});

export const createElenaLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("elena_lessons")
      .insert({
        owner_id: userId,
        title: data.title,
        content: data.content,
        category: data.category,
        priority: 5,
        steps: data.steps,
        is_fundamental: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    invalidateLessonsCache(userId);
    return { lesson: row };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
  content: z.string().max(2000).optional(),
  category: z.string().min(1).max(40).optional(),
  is_active: z.boolean().optional(),
  steps: z.array(StepSchema).max(20).optional(),
});

export const updateElenaLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("elena_lessons").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    invalidateLessonsCache(userId);
    return { ok: true };
  });

export const deleteElenaLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("elena_lessons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    invalidateLessonsCache(userId);
    return { ok: true };
  });
