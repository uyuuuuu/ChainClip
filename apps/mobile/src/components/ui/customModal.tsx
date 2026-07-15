import React from 'react';
import { View, Text } from 'react-native';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type CustomModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
};

export const CustomModal = ({
  isOpen,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = 'OK',
  cancelText = 'キャンセル',
}: CustomModalProps) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 flex-row item-center justify-center gap-8">
          <AlertDialogCancel className="w-32">
            <Text className="font-semibold">{cancelText}</Text>
          </AlertDialogCancel>
          <AlertDialogAction onPress={onConfirm} className="w-32 bg-primary">
            <Text className="text-white font-semibold">{confirmText}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
